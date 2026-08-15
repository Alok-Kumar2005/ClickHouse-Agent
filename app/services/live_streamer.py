import asyncio
import random
import uuid
import urllib.request
import urllib.error
import json
import os
from datetime import datetime
from app.db.clickhouse import ch_client


class LiveBoxOfficeStreamer:
    def __init__(self):
        self.is_active = False
        self.total_events_ingested = 0
        self._task = None
        self.movies = []
        self.config = {}
        self.fallback_movies = [
            "Dune: Part Two", "Avatar: The Way of Water", "Oppenheimer", "Barbie",
            "The Dark Knight", "Avengers: Endgame", "Interstellar",
            "Spider-Man: Across the Spider-Verse", "Everything Everywhere All at Once",
            "Inside Out 2", "Deadpool & Wolverine", "Gladiator II"
        ]

    def _ensure_tables(self):
        """Create secondary tables if they do not already exist in ClickHouse."""
        # theater_occupancy — matches existing schema in clickhouse_schema.sql
        ch_client.command("""
            CREATE TABLE IF NOT EXISTS theater_occupancy (
                theater_id    String,
                theater_name  String,
                movie_id      String,
                total_seats   UInt16,
                booked_seats  UInt16,
                occupancy_rate Float32,
                show_time     DateTime
            ) ENGINE = MergeTree()
            ORDER BY (theater_id, show_time)
        """)

        # audience_sentiment — matches existing schema in clickhouse_schema.sql
        ch_client.command("""
            CREATE TABLE IF NOT EXISTS audience_sentiment (
                movie_id        String,
                source          String,
                sentiment_score Float32,
                post_volume     UInt32,
                timestamp       DateTime DEFAULT now()
            ) ENGINE = MergeTree()
            ORDER BY (movie_id, timestamp)
        """)
        print("Live Streamer: secondary tables verified / created.")

    async def prefetch_movies(self):
        """Fetch now-playing movies from TMDB API if TMDB_API_KEY is present, else use fallback list."""
        # Override with user specified movies if present
        if self.config and self.config.get("movies"):
            self.movies = [m.strip() for m in self.config["movies"] if m.strip()]
            if self.movies:
                print(f"Using user-specified movies: {self.movies}")
                return

        tmdb_key = os.getenv("TMDB_API_KEY")
        if tmdb_key:
            try:
                url = f"https://api.themoviedb.org/3/movie/now_playing?api_key={tmdb_key}&language=en-US&page=1"

                def sync_fetch():
                    req = urllib.request.Request(url, headers={"User-Agent": "BoxOfficePulse/1.0"})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        return json.loads(response.read().decode())

                data = await asyncio.to_thread(sync_fetch)
                results = data.get("results", [])
                if results:
                    self.movies = [m["title"] for m in results if m.get("title")]
                    print(f"Loaded {len(self.movies)} movies from TMDB API.")
                    return
            except Exception as e:
                print(f"Error fetching from TMDB: {e}. Falling back to default list.")

        # Fallback if no key or API failed
        self.movies = self.fallback_movies
        print(f"Loaded fallback list of {len(self.movies)} blockbuster movies.")

    async def _stream_loop(self):
        await self.prefetch_movies()
        default_theaters = ["th_nyc_01", "th_la_02", "th_chi_03", "TH-102", "TH-103"]
        theater_names = {
            "th_nyc_01": "AMC Empire 25 NYC",
            "th_la_02": "ArcLight Hollywood LA",
            "th_chi_03": "AMC River East Chicago",
            "TH-102": "Regal Cinemas 102",
            "TH-103": "Cinemark 103",
        }
        sentiment_sources = ["twitter", "tiktok", "letterboxd"]

        while self.is_active:
            try:
                # If configuration changes on the fly, re-evaluate the movie list
                if self.config and self.config.get("movies"):
                    user_movies = [m.strip() for m in self.config["movies"] if m.strip()]
                    if user_movies and self.movies != user_movies:
                        self.movies = user_movies

                loop_delay = 1.0
                eps = self.config.get("events_per_second") if self.config else None
                if eps is not None:
                    num_events = int(eps)
                else:
                    loop_delay = random.uniform(2.0, 3.0)
                    num_events = random.randint(5, 10)

                now = datetime.utcnow()

                # ── ticket_sales rows ──────────────────────────────────────────
                ticket_rows = []
                # Track which (theater_id, screen_number, movie_title) combos appear this batch
                occupancy_combos: set[tuple] = set()
                active_movies: set[str] = set()

                for _ in range(num_events):
                    if not self.movies:
                        self.movies = self.fallback_movies

                    movie_title = random.choice(self.movies)

                    # Determine ticket price based on config range
                    min_p = self.config.get("min_price") if self.config else None
                    max_p = self.config.get("max_price") if self.config else None
                    if min_p is not None and max_p is not None:
                        ticket_price = round(random.uniform(min_p, max_p), 2)
                    elif min_p is not None:
                        ticket_price = round(random.uniform(min_p, min_p + 15), 2)
                    elif max_p is not None:
                        ticket_price = round(random.uniform(max(0, max_p - 15), max_p), 2)
                    else:
                        ticket_price = round(random.choice([12.50, 15.00, 18.50, 22.00]), 2)

                    # Determine theater ID based on config theaters
                    custom_theaters = self.config.get("theaters") if self.config else None
                    if custom_theaters:
                        theater_id = random.choice([t.strip() for t in custom_theaters if t.strip()])
                    else:
                        theater_id = random.choice(default_theaters)

                    ticket_id = str(uuid.uuid4())[:8]
                    movie_id = f"mov_{movie_title.lower().replace(' ', '_')[:12]}"
                    screen_number = random.randint(1, 10)
                    discount_applied = random.choice([0.0, 0.0, 1.5, 3.0])

                    ticket_rows.append((
                        ticket_id,
                        movie_id,
                        movie_title,
                        theater_id,
                        screen_number,
                        ticket_price,
                        discount_applied,
                        now,
                    ))

                    occupancy_combos.add((theater_id, screen_number, movie_title, movie_id))
                    active_movies.add((movie_title, movie_id))

                # Batch insert ticket_sales
                if ticket_rows:
                    ch_client.insert(
                        "ticket_sales",
                        ticket_rows,
                        column_names=[
                            "ticket_id", "movie_id", "movie_title", "theater_id",
                            "screen_number", "ticket_price", "discount_applied", "timestamp"
                        ],
                    )
                    self.total_events_ingested += num_events
                    print(f"Live Streamer: Ingested {num_events} ticket events. Total: {self.total_events_ingested}")

                # ── theater_occupancy rows ─────────────────────────────────────
                occupancy_rows = []
                for theater_id, screen_number, movie_title, movie_id in occupancy_combos:
                    total_seats = 200
                    booked_seats = random.randint(80, 190)
                    occupancy_rate = round(booked_seats / total_seats, 4)
                    name = theater_names.get(theater_id, f"Theater {theater_id}")
                    occupancy_rows.append((
                        theater_id,
                        name,
                        movie_id,
                        total_seats,
                        booked_seats,
                        occupancy_rate,
                        now,
                    ))

                if occupancy_rows:
                    ch_client.insert(
                        "theater_occupancy",
                        occupancy_rows,
                        column_names=[
                            "theater_id", "theater_name", "movie_id",
                            "total_seats", "booked_seats", "occupancy_rate", "show_time"
                        ],
                    )
                    print(f"Live Streamer: Inserted {len(occupancy_rows)} occupancy records.")

                # ── audience_sentiment rows ────────────────────────────────────
                sentiment_rows = []
                for movie_title, movie_id in active_movies:
                    source = random.choice(sentiment_sources)
                    sentiment_score = round(random.uniform(0.0, 1.0), 4)
                    post_volume = random.randint(50, 5000)
                    sentiment_rows.append((
                        movie_id,
                        source,
                        sentiment_score,
                        post_volume,
                        now,
                    ))

                if sentiment_rows:
                    ch_client.insert(
                        "audience_sentiment",
                        sentiment_rows,
                        column_names=[
                            "movie_id", "source", "sentiment_score", "post_volume", "timestamp"
                        ],
                    )
                    print(f"Live Streamer: Inserted {len(sentiment_rows)} sentiment records.")

            except Exception as e:
                print(f"Error in Live Streamer loop: {e}")

            await asyncio.sleep(loop_delay)

    def start(self, config: dict = None):
        self.config = config or {}
        if not self.is_active:
            self.is_active = True
            # Ensure secondary tables exist before launching the stream loop
            try:
                self._ensure_tables()
            except Exception as e:
                print(f"Live Streamer: Warning — could not ensure secondary tables: {e}")
            self._task = asyncio.create_task(self._stream_loop())
            return True
        else:
            # Already active: just update config on the fly
            if self.config.get("movies"):
                self.movies = [m.strip() for m in self.config["movies"] if m.strip()]
            return True

    def stop(self):
        if not self.is_active:
            return False
        self.is_active = False
        if self._task:
            self._task.cancel()
            self._task = None
        return True


live_streamer = LiveBoxOfficeStreamer()


def start_live_boxoffice_stream(config: dict = None):
    """Entry point to start the stream."""
    return live_streamer.start(config)
