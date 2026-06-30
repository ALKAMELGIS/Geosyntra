//! AOI vegetation report PDF bytes (Task 32.FD-4).

use crate::gis::aoi_report::AoiVegetationReport;

#[derive(Debug, Clone, PartialEq)]
pub struct AoiReportPdf {
    pub filename: String,
    pub pages: usize,
    pub bytes: Vec<u8>,
}

pub fn build_aoi_report_pdf(report: &AoiVegetationReport) -> AoiReportPdf {
    let title = format!("AOI Report — {}", report.aoi_name);
    let mut lines = vec![
        title.clone(),
        format!("Index: {}", report.index_label),
        format!("Period: {} → {}", report.date_start, report.date_end),
        format!("Area: {:.2} km²", report.aoi_area_km2),
        String::new(),
    ];
    for line in &report.summary_lines {
        lines.push(line.clone());
    }
    lines.push(String::new());
    lines.push("Time series:".into());
    for pt in &report.time_series {
        lines.push(format!("  {} — {:.3}", pt.date, pt.value));
    }
    lines.push(String::new());
    lines.push(report.analysis.clone());
    let text = lines.join("\n");
    let bytes = simple_pdf_bytes(&title, &text);
    AoiReportPdf {
        filename: format!("{}-report.pdf", sanitize_filename(&report.aoi_name)),
        pages: 1,
        bytes,
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Minimal PDF 1.4 single-page text document (no external deps).
fn simple_pdf_bytes(title: &str, body: &str) -> Vec<u8> {
    let content = format!(
        "BT /F1 12 Tf 50 750 Td ({}) Tj 0 -20 Td /F1 10 Tf ({}) Tj ET",
        escape_pdf_text(title),
        escape_pdf_text(body)
    );
    let len = content.len();
    let pdf = format!(
        "%PDF-1.4\n\
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n\
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n\
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] \
/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n\
4 0 obj<< /Length {len} >>stream\n{content}\nendstream endobj\n\
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n\
xref\n0 6\n0000000000 65535 f \n\
trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF"
    );
    pdf.into_bytes()
}

fn escape_pdf_text(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('\n', "\\n")
        .chars()
        .take(4000)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gis::aoi_report::{ReportIndexId, ReportTimePoint};
    use serde_json::json;

    #[test]
    fn pdf_bytes_start_with_header() {
        let report = AoiVegetationReport {
            aoi_name: "Field A".into(),
            index_label: "NDVI".into(),
            index_id: ReportIndexId::Ndvi,
            date_start: "2026-01-01".into(),
            date_end: "2026-01-31".into(),
            aoi_area_km2: 1.2,
            summary_lines: vec!["Healthy canopy.".into()],
            analysis: "Stable vegetation.".into(),
            time_series: vec![ReportTimePoint {
                date: "2026-01-01".into(),
                value: 0.5,
            }],
            table_rows: vec![],
            change_detection_slots: vec![],
            heatmap_geojson: json!({}),
            aoi_outline_geojson: json!({}),
        };
        let pdf = build_aoi_report_pdf(&report);
        assert!(pdf.bytes.starts_with(b"%PDF"));
    }
}
