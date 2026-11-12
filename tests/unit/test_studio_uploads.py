"""Design-reference upload confinement (services/studio.py).

Every asset must live inside the plugin's uploads folder: attach resolves and
rejects escapes (symlink, ``..``), bare filenames resolve inside uploads, and
image_path re-checks containment at serve time so old rows pointing outside are
never served.
"""
from __future__ import annotations

import pytest

from flowershop_core.errors import NotFound, ValidationError
from flowershop_core.services import studio


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    d = tmp_path / "uploads"
    d.mkdir()
    monkeypatch.setenv("FLOWERSHOP_UPLOADS_DIR", str(d))
    return d


def _add_image(d, name: str = "rose.png"):
    p = d / name
    p.write_bytes(b"\x89PNG-fake")
    return p


def test_attach_accepts_file_inside_uploads(store, uploads):
    img = _add_image(uploads, "FS-1001-peony.jpg")
    out = studio.attach(store, {"asset_path": str(img), "prompt": "peony reference"})
    assert out["asset_path"] == str(img.resolve())
    assert out["image_url_path"].startswith("/designs/")
    assert studio.image_path(store, out["id"]) == img.resolve()


def test_attach_accepts_bare_filename(store, uploads):
    _add_image(uploads, "peony.png")
    out = studio.attach(store, {"asset_path": "peony.png"})
    assert out["asset_path"] == str((uploads / "peony.png").resolve())


def test_attach_rejects_file_outside_uploads(store, uploads, tmp_path):
    outside = tmp_path / "desktop-folder.png"
    outside.write_bytes(b"\x89PNG-fake")
    with pytest.raises(ValidationError) as ei:
        studio.attach(store, {"asset_path": str(outside)})
    msg = str(ei.value)
    assert "Put the image in" in msg
    assert str(uploads.resolve()) in msg


def test_attach_rejects_symlink_escape(store, uploads, tmp_path):
    outside = tmp_path / "secret.png"
    outside.write_bytes(b"\x89PNG-fake")
    link = uploads / "looks-inside.png"
    link.symlink_to(outside)
    with pytest.raises(ValidationError) as ei:
        studio.attach(store, {"asset_path": str(link)})
    assert "Put the image in" in str(ei.value)


def test_attach_rejects_parent_traversal(store, uploads, tmp_path):
    outside = tmp_path / "secret.png"
    outside.write_bytes(b"\x89PNG-fake")
    with pytest.raises(ValidationError) as ei:
        studio.attach(store, {"asset_path": str(uploads / ".." / "secret.png")})
    assert "Put the image in" in str(ei.value)


def test_image_path_serve_time_recheck(store, uploads, tmp_path):
    img = _add_image(uploads)
    out = studio.attach(store, {"asset_path": str(img)})
    assert studio.image_path(store, out["id"]) == img.resolve()
    # simulate a left-over/old row that points outside the uploads folder
    outside = tmp_path / "old-row.png"
    outside.write_bytes(b"\x89PNG-fake")
    with store.tx() as t:
        t.execute("UPDATE design_references SET asset_path = ? WHERE id = ?",
                  (str(outside), out["id"]))
    with pytest.raises(NotFound) as ei:
        studio.image_path(store, out["id"])
    assert "outside the uploads folder" in str(ei.value)


def test_import_into_uploads_copies_with_safe_name(store, uploads, tmp_path):
    src = tmp_path / "design.png"
    src.write_bytes(b"\x89PNG-fake")
    target = studio.import_into_uploads(src)
    assert target.parent == uploads.resolve()
    assert target.suffix == ".png"
    assert target.read_bytes() == src.read_bytes()
    assert len(target.name) > len(".png")  # generated name, not the source name
    # and the copied file is attachable
    out = studio.attach(store, {"asset_path": str(target)})
    assert out["asset_path"] == str(target.resolve())
