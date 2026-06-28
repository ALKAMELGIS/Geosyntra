# PostgreSQL database names — one namespace per stack (Express prod vs Axum preview).
# Used by NixOS module, backup/restore scripts, and env templates.
{
  expressDatabase = "geosyntra_express";
  axumDatabase = "geosyntra_axum";
  # Optional GIS / shared read models (future)
  gisDatabase = "geosyntra_gis";
  dbUser = "geosyntra";
  dbRole = "geosyntra";
}
