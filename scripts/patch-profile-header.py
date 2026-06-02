from pathlib import Path

root = Path(__file__).resolve().parents[1]
sheet = root / "frontend/src/pages/home/profile/HomeProfileSheet.tsx"
hero = (root / "scripts/hero-fragment.txt").read_text(encoding="utf-8")
text = sheet.read_text(encoding="utf-8")
text = text.replace("          <motionless />", hero.rstrip() + "\n", 1)
text = text.replace('className="home-profile-sheet__head"', 'className="home-profile-sheet__head home-profile-sheet__head--hero"', 1)
# Hide duplicate name/email in list when shown in hero
text = text.replace(
    """          <motionless />
          <motionless />
          <motionless />
          <motionless />""",
    "",
)
sheet.write_text(text, encoding="utf-8")
print("patched")
