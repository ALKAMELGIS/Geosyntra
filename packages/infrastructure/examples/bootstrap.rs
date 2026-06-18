//! Dev bootstrap: migrate + seed RBAC MATRIX.
//!
//! ```bash
//! DATABASE_URL=postgres://... cargo run --example bootstrap -p infrastructure
//! ```

use infrastructure::postgres::{bootstrap, connect};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let pool = connect(&url).await?;
    bootstrap(&pool).await?;
    println!("bootstrap complete");
    Ok(())
}
