import asyncio
import random
import uuid
from datetime import datetime, timedelta
from app.db.clickhouse import get_clickhouse_client

# mock data
THEATERS = [
    {"id": "th_nyc_01", "name": "AMC Lincoln Square (NYC)", "seats": 300},
    {"id": "th_la_02", "name": "TCL Chinese Theatre (LA)", "seats": 400},
    {"id": "th_chi_03", "name": "Regal City Centre (Chicago)", "seats": 200},
]

DEFAULT_MOVIES = [
    {"id": "mov_dune3", "title": "Dune: Part Three", "is_released": False},
    {"id": "mov_batman2", "title": "The Batman Part II", "is_released": False},
    {"id": "mov_avatar3", "title": "Avatar: Fire and Ash", "is_released": True},
]


class TelemetrySimulator:
    def __init__(self):
        self.is_running = False

    def register_movie_telemetry(self, movie_title: str, is_released: bool = True) -> dict:
        """
        Dynamically handles telemetry creation for new/unrecognized movies.
        - If RELEASED: Seeds real-time ticket sales + occupancy + sentiment.
        - If UNRELEASED: Seeds ONLY social media buzz & pre-release tracking (NO fake ticket sales).
        """
        client = get_clickhouse_client()
        clean_title = movie_title.strip()
        movie_id = f"mov_{clean_title.lower().replace(' ', '_')[:12]}"
        now = datetime.now()

        # Check if telemetry already exists
        res = client.query(f"SELECT count() FROM audience_sentiment WHERE lower(movie_id) = lower('{movie_id}')")
        if res.result_rows and res.result_rows[0][0] > 0:
            return {"status": "exists", "movie_id": movie_id}

        if not is_released:
            print(f"🔮 Seeding PRE-RELEASE tracking telemetry for upcoming film: '{clean_title}'")
            # ONLY insert Pre-Release Social Buzz & Advance Interest
            sentiment_rows = [
                (movie_id, "tiktok_buzz", 0.92, 15400, now),
                (movie_id, "twitter_hype", 0.88, 8900, now),
                (movie_id, "letterboxd_watchlist", 0.85, 3200, now),
            ]
            client.insert(
                "audience_sentiment",
                sentiment_rows,
                column_names=["movie_id", "source", "sentiment_score", "post_volume", "timestamp"]
            )
            return {"status": "seeded_unreleased", "movie_id": movie_id}

        else:
            print(f"Seeding ACTIVE THEATRICAL telemetry for released film: '{clean_title}'")
            # 1. Insert ticket sales
            ticket_rows = []
            for _ in range(25):
                theater = random.choice(THEATERS)
                price = random.choice([14.00, 18.00, 22.50])
                ticket_rows.append((
                    str(uuid.uuid4())[:8],
                    movie_id,
                    clean_title,
                    theater["id"],
                    random.randint(1, 8),
                    price,
                    0.0,
                    now
                ))
            client.insert(
                "ticket_sales",
                ticket_rows,
                column_names=["ticket_id", "movie_id", "movie_title", "theater_id", "screen_number", "ticket_price", "discount_applied", "timestamp"]
            )

            # 2. Insert sentiment
            sentiment_rows = [
                (movie_id, "tiktok", 0.85, 3400, now),
                (movie_id, "twitter", 0.72, 1800, now),
                (movie_id, "letterboxd", 0.90, 950, now),
            ]
            client.insert(
                "audience_sentiment",
                sentiment_rows,
                column_names=["movie_id", "source", "sentiment_score", "post_volume", "timestamp"]
            )

            # 3. Insert occupancy
            occupancy_rows = []
            for th in THEATERS:
                booked = int(th["seats"] * random.uniform(0.5, 0.9))
                occupancy_rows.append((
                    th["id"],
                    th["name"],
                    movie_id,
                    th["seats"],
                    booked,
                    round(booked / th["seats"], 2),
                    now + timedelta(hours=1)
                ))
            client.insert(
                "theater_occupancy",
                occupancy_rows,
                column_names=["theater_id", "theater_name", "movie_id", "total_seats", "booked_seats", "occupancy_rate", "show_time"]
            )

            return {"status": "seeded_released", "movie_id": movie_id}

    def generate_ticket_sales_batch(self, count: int = 10):
        """Generates real-time background ticket transactions."""
        rows = []
        now = datetime.now()
        active_movies = [m for m in DEFAULT_MOVIES if m["is_released"]]

        for _ in range(count):
            movie = random.choice(active_movies)
            theater = random.choice(THEATERS)
            price = random.choice([12.50, 15.00, 18.50, 22.00])
            discount = random.choice([0.0, 0.0, 0.0, 2.50, 5.00])

            rows.append((
                str(uuid.uuid4())[:8],
                movie["id"],
                movie["title"],
                theater["id"],
                random.randint(1, 12),
                price,
                discount,
                now
            ))
        return rows

    def generate_sentiment_batch(self):
        """Generates background social sentiment scores."""
        rows = []
        now = datetime.now()
        sources = ["twitter", "tiktok", "letterboxd"]

        for movie in DEFAULT_MOVIES:
            for source in sources:
                sentiment = round(random.uniform(-0.5, 0.95), 2)
                volume = random.randint(50, 5000)
                rows.append((
                    movie["id"],
                    source,
                    sentiment,
                    volume,
                    now
                ))
        return rows

    def generate_occupancy_batch(self):
        """Generates theater screen occupancy snapshots."""
        rows = []
        now = datetime.now() + timedelta(hours=2)

        for theater in THEATERS:
            for movie in [m for m in DEFAULT_MOVIES if m["is_released"]]:
                booked = random.randint(20, theater["seats"])
                rate = round(booked / theater["seats"], 2)
                rows.append((
                    theater["id"],
                    theater["name"],
                    movie["id"],
                    theater["seats"],
                    booked,
                    rate,
                    now
                ))
        return rows

    def push_to_clickhouse(self):
        """Inserts generated telemetry directly into ClickHouse tables."""
        client = get_clickhouse_client()

        # Insert Ticket Sales
        ticket_data = self.generate_ticket_sales_batch(count=15)
        client.insert(
            "ticket_sales",
            ticket_data,
            column_names=["ticket_id", "movie_id", "movie_title", "theater_id", "screen_number", "ticket_price", "discount_applied", "timestamp"]
        )

        # Insert Sentiment
        sentiment_data = self.generate_sentiment_batch()
        client.insert(
            "audience_sentiment",
            sentiment_data,
            column_names=["movie_id", "source", "sentiment_score", "post_volume", "timestamp"]
        )

        # Insert Occupancy
        occupancy_data = self.generate_occupancy_batch()
        client.insert(
            "theater_occupancy",
            occupancy_data,
            column_names=["theater_id", "theater_name", "movie_id", "total_seats", "booked_seats", "occupancy_rate", "show_time"]
        )

        print(f"⚡ [{datetime.now().strftime('%H:%M:%S')}] Ingested telemetry batch into ClickHouse!")

    async def start_loop(self, interval_seconds: int = 5):
        """Continuous background streaming loop."""
        self.is_running = True
        print("Telemetry Simulator started streaming...")
        while self.is_running:
            self.push_to_clickhouse()
            await asyncio.sleep(interval_seconds)


simulator = TelemetrySimulator()

if __name__ == "__main__":
    # Seed default catalog movies on startup
    for m in DEFAULT_MOVIES:
        simulator.register_movie_telemetry(m["title"], is_released=m["is_released"])
    simulator.push_to_clickhouse()