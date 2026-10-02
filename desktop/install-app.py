"""Build my local writer app and put a shortcut on my Desktop. Requires Xcode command-line tools."""
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parent.parent
installed_app = Path.home() / "Applications" / "OmniLede.app"
desktop_app = Path.home() / "Desktop" / "OmniLede.app"
for required in (
    repo / "Start OmniLede.command",
    repo / "package.json",
    repo / "desktop/DailyPlanModels.swift",
    repo / "desktop/OmniLede.swift",
):
    if not required.is_file():
        raise SystemExit(f"OmniLede project is incomplete: missing {required}")
# Build and sign away from Desktop's file-provider metadata before replacing the launcher.
with tempfile.TemporaryDirectory(prefix="omnilede-app-") as temp:
    bundle = Path(temp) / "OmniLede.app"
    macos = bundle / "Contents" / "MacOS"
    resources = bundle / "Contents" / "Resources"
    macos.mkdir(parents=True)
    resources.mkdir(parents=True)
    subprocess.run(
        [
            "/usr/bin/swiftc",
            str(repo / "desktop/DailyPlanModels.swift"),
            str(repo / "desktop/OmniLede.swift"),
            "-o",
            str(macos / "OmniLede"),
            "-framework",
            "AppKit",
        ],
        check=True,
    )
    iconset = Path(temp) / "OmniLede.iconset"
    iconset.mkdir()
    shutil.copyfile(repo / "public/icons/icon-512.png", iconset / "icon_512x512.png")
    subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(resources / "OmniLede.icns")], check=True)
    info = dict(CFBundleIdentifier="com.rickysharan.omnilede.localwriter", CFBundleName="OmniLede",
                CFBundleDisplayName="OmniLede", CFBundleExecutable="OmniLede", CFBundlePackageType="APPL",
                CFBundleIconFile="OmniLede", CFBundleShortVersionString="4.0", CFBundleVersion="4",
                LSMinimumSystemVersion="12.0",
                NSHighResolutionCapable=True, OmniLedeProjectPath=str(repo))
    with (bundle / "Contents/Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(bundle)], check=True)
    archive = Path.home() / "Library/Application Support/OmniLede"
    archive.mkdir(parents=True, exist_ok=True)

    def archive_existing(candidate: Path) -> None:
        if candidate.is_symlink():
            candidate.unlink()
        elif candidate.exists():
            backup = Path(tempfile.mkdtemp(prefix="previous-app-", dir=archive)) / "OmniLede.app"
            shutil.move(str(candidate), str(backup))

    archive_existing(desktop_app)
    archive_existing(installed_app)
    installed_app.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(bundle, installed_app, copy_function=shutil.copyfile)
    (installed_app / "Contents/MacOS/OmniLede").chmod(0o755)
    # Keep the signed bundle outside Desktop's file provider, which can add FinderInfo later.
    subprocess.run(["/usr/bin/xattr", "-cr", str(installed_app)], check=True)
    subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(installed_app)], check=True)
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose", str(installed_app)], check=True)
    desktop_app.symlink_to(installed_app)
    print(f"Installed {installed_app}")
    print(f"Desktop shortcut {desktop_app}")
