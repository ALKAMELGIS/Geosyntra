//! GIS external tables + relationships (Task 32.0).

mod handlers;
mod store;

pub use handlers::{
    create_relationship, create_table_row, delete_relationship, delete_table_row,
    get_table_schema, list_external_tables, list_relationships, list_table_rows,
    resolve_relationships, test_db_connection, update_relationship, update_table_row,
};
