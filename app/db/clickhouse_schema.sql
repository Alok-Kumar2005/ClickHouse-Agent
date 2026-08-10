-- Ticket Sales Table
CREATE TABLE IF NOT EXISTS ticket_sales (
    ticket_id String,
    movie_id String,
    movie_title String,
    theater_id String,
    screen_number UInt8,
    ticket_price Float32,
    discount_applied Float32,
    timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (movie_id, theater_id, timestamp);

-- Audience Sentiment Table
CREATE TABLE IF NOT EXISTS audience_sentiment (
    movie_id String,
    source String, -- 'twitter', 'tiktok', 'letterboxd'
    sentiment_score Float32, -- Range: -1.0 to 1.0
    post_volume UInt32,
    timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (movie_id, timestamp);

-- Theater Occupancy Table
CREATE TABLE IF NOT EXISTS theater_occupancy (
    theater_id String,
    theater_name String,
    movie_id String,
    total_seats UInt16,
    booked_seats UInt16,
    occupancy_rate Float32,
    show_time DateTime
) ENGINE = MergeTree()
ORDER BY (theater_id, show_time);