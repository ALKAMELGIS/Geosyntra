use std::path::Path;

fn main() {
    let scss_dir = Path::new("assets/scss");
    let out_css = Path::new("assets/css/app.css");

    println!("cargo:rerun-if-changed=assets/scss/");

    let entry = scss_dir.join("main.scss");
    let css = grass::from_path(&entry, &grass::Options::default()).unwrap_or_else(|err| {
        panic!("compile {}: {err}", entry.display());
    });

    std::fs::create_dir_all(out_css.parent().expect("css parent dir")).unwrap_or_else(|err| {
        panic!("create {}: {err}", out_css.parent().unwrap().display());
    });
    std::fs::write(out_css, css).unwrap_or_else(|err| {
        panic!("write {}: {err}", out_css.display());
    });

    // Sync static assets (JS bridge, etc.) into public/ for dx serve.
    copy_dir_all(Path::new("assets"), Path::new("public/assets")).unwrap_or_else(|err| {
        panic!("sync assets -> public/assets: {err}");
    });
    if Path::new("public/index.html").exists() {
        println!("cargo:rerun-if-changed=public/index.html");
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

