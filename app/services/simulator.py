import asyncio
import random
import uuid
from datetime import datetime, timedelta
from app.db.clickhouse import get_clickhouse_client

## mock data
MOVIES = [
    {"id": "mov_dune3", "title": "Dune: Part Three"},
    {"id": "mov_batman2", "title": "The Batman Part II"},
    {"id": "mov_avatar3", "title": "Avatar: Fire and Ash"},
]

THEATERS = [
    {"id": "th_nyc_01", "name": "AMC Lincoln Square (NYC)", "seats": 300},
    {"id": "th_la_02", "name": "TCL Chinese Theatre (LA)", "seats": 400},
    {"id": "th_chi_03", "name": "Regal City Centre (Chicago)", "seats": 200},
]

class TelemetrySimulator:
    def __init__(self):
        self.is_running = False

    def generate_ticket_sales_batch(self, count: int = 10):
        "Generate mock ticket sakes row"
        rows = []
        now = datetime.now()

        for _ in range(count):
            movie = random.choice(MOVIES)
            theater = random.choice(THEATERS)
            price = random.choice([12.50, 15.00, 18.50, 22.00])
            discount = random.choice([0.0, 0.0, 0.0, 2.50, 5.00])
            
            rows.append((
                str(uuid.uuid4())[:8],
                movie["id"],
                movie["title"],
                theater["id"],
                random.randint(1, 12), ## screen number
                price,
                discount,
                now
            ))
        return rows

    def generate_sentiment_batch(self):
        """Generates social sentiment score rows."""
        rows = []
        now = datetime.now()
        sources = ["twitter", "tiktok", "letterboxd"]
        
        for movie in MOVIES:
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
        """Generates theater screen occupancy snapshot rows."""
        rows = []
        now = datetime.now() + timedelta(hours=2) # Upcoming showtimes
        
        for theater in THEATERS:
            for movie in MOVIES:
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
        "Insert data to clickhouse tables"
        client = get_clickhouse_client()

        # insert ticket data
        ticket_data = self.generate_ticket_sales_batch(count= 15)
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

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Ingested telemetry batch into ClickHouse....")

    async def start_loop(self, interval_seconds: int = 5):
        self.is_running = True
        print("Telemetry Simulator started streaming...")
        while self.is_running:
            self.push_to_clickhouse()
            await asyncio.sleep(interval_seconds)

simulator = TelemetrySimulator()

if __name__ == "__main__":
    simulator.push_to_clickhouse()