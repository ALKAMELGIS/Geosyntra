# GIS Attribute Table Domain Display

## Purpose

The GIS Map attribute table displays ArcGIS subtype and coded domain descriptions to users while keeping the original code value available for internal processing, selection, filtering, export, and future edits.

## Display Rules

- If the layer has a `typeIdField`, the table resolves the subtype code against `arcgisLayerDefinition.types`.
- If a field has a coded value domain, the table resolves the raw code against `domain.codedValues`.
- Description lookup accepts `description`, `label`, `name`, or `displayName`.
- If no description exists, the table shows the raw code and marks the cell with a warning icon.
- The raw code remains stored in the original feature properties and is never overwritten.

## User Controls

- `Display`: switches visible table values between `Description` and `Code` without reloading the page.
- `Search by`: searches `Description`, `Code`, or `Both`.
- `Advanced filter`: filters rows by field, operator, and value using the resolved display text plus the raw code.
- `Fields`: hides or shows columns using the existing field visibility control.
- Drag table headers to reorder columns, or use the header arrow buttons for keyboard-accessible reordering.
- `Save format`: saves display mode, search mode, hidden columns, column order, and active filter to `localStorage`.
- `Apply format`: restores the saved table layout for the same layer.
- `Export CSV`: exports the currently filtered rows using the active display mode.

## Example

For a coded domain field:

```json
{
  "name": "Structure_Type",
  "domain": {
    "type": "codedValue",
    "codedValues": [
      { "code": 1001, "name": "Greenhouse" },
      { "code": 1002, "name": "Nethouse" }
    ]
  }
}
```

The feature property stays unchanged:

```json
{ "Structure_Type": 1001 }
```

When `Display = Description`, users see `Greenhouse` with the code retained as table metadata. When `Display = Code`, users see `1001`.

## Performance Notes

The table limits visible processing to the first 10,000 records to keep interaction smooth in the browser. Search and filtering are applied to the loaded row set and do not mutate source GeoJSON.

## Accessibility Notes

Controls use native `select`, `input`, and `button` elements with labels or accessible titles. Missing descriptions use an icon plus a tooltip, while the code remains visible as fallback text.
