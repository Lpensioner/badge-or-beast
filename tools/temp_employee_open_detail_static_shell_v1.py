#!/usr/bin/env python3
"""Controlled local insertion for employee open/detail static shell v1."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import uuid as uuid_lib
from copy import deepcopy
from typing import Any

SCENE_PATH = r"D:\badge-or-beast\assets\scenes\GameScene.scene"
BACKUP_DIR = r"C:\Users\EDY\Desktop\BadgeOrBeast_scene_backup\employee_open_detail_static_shell_v1"
BACKUP_NAME = "GameScene.before_employee_open_detail_static_shell_v1.scene"

OPEN_SPRITE_UUID = "a4b615c0-ed3e-47ab-9fb9-985f9bdd7c6d@f9941"
DETAIL_SPRITE_UUID = "05553a6e-866d-44c1-8ee8-1704984261f6@f9941"

CONTROLLERS = {
    "EvidencePreviewController": "275beDX9ndMj4B9nI3JxLF3",
    "TelephoneController": "670e6jjlrVIRJSstCqXKdk5",
    "AppointmentRosterController": "9b4e7lWv/pAI7pJ/L9nzG6g",
    "ShutterToggleController": "dfe3fAaU5VF2qfvMxynRGBX",
}

PROTECTED_NODES = [
    "EmployeeDrawer01Visual",
    "EmployeeDrawer02Visual",
    "EmployeeDrawer03Visual",
    "EmployeeDrawer01Hit",
    "EmployeeDrawer02Hit",
    "EmployeeDrawer03Hit",
]

NEW_NODE_NAMES = [
    "EmployeeDrawersOpenRuntime",
    "EmployeeDrawer01OpenVisual",
    "EmployeeDrawer02OpenVisual",
    "EmployeeDrawer03OpenVisual",
    "EmployeeFileDetailPanelRuntime",
    "EmployeeFileDetailBody",
]

UNIQUE_REQUIRED = [
    "Canvas",
    "DeskEvidenceRuntime",
    "EmployeeDrawersClosedRuntime",
    *PROTECTED_NODES,
]


def cid(ref: Any) -> int:
    return ref if isinstance(ref, int) else ref["__id__"]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str) -> str:
    with open(path, "rb") as f:
        return sha256_bytes(f.read())


def find_nodes(scene: list[Any], name: str) -> list[tuple[int, dict[str, Any]]]:
    return [
        (i, x)
        for i, x in enumerate(scene)
        if isinstance(x, dict) and x.get("__type__") == "cc.Node" and x.get("_name") == name
    ]


def get_component(scene: list[Any], node: dict[str, Any], comp_type: str) -> dict[str, Any]:
    for ref in node.get("_components", []):
        comp = scene[cid(ref)]
        if comp.get("__type__") == comp_type:
            return comp
    raise KeyError(comp_type)


def node_snapshot(scene: list[Any], name: str) -> dict[str, Any]:
    _, node = find_nodes(scene, name)[0]
    ui = get_component(scene, node, "cc.UITransform")
    return {
        "position": deepcopy(node["_lpos"]),
        "euler": deepcopy(node["_euler"]),
        "scale": deepcopy(node["_lscale"]),
        "size": deepcopy(ui["_contentSize"]),
        "active": node["_active"],
    }


def controller_snapshot(scene: list[Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, ctype in CONTROLLERS.items():
        comps = [(i, c) for i, c in enumerate(scene) if isinstance(c, dict) and c.get("__type__") == ctype]
        out[name] = [
            {
                "comp_id": i,
                "node_id": c["node"]["__id__"],
                "node_name": scene[c["node"]["__id__"]]["_name"],
                "enabled": c.get("_enabled"),
            }
            for i, c in comps
        ]
    return out


def preflight(scene: list[Any]) -> tuple[dict[str, Any], str | None]:
    for name in UNIQUE_REQUIRED:
        if len(find_nodes(scene, name)) != 1:
            return {}, f"unique check failed: {name}"

    for name in NEW_NODE_NAMES:
        if find_nodes(scene, name):
            return {}, f"forbidden existing node: {name}"

    for i in (1, 2, 3):
        v = find_nodes(scene, f"EmployeeDrawer0{i}Visual")[0][1]
        h = find_nodes(scene, f"EmployeeDrawer0{i}Hit")[0][1]
        vp, hp = v["_lpos"], h["_lpos"]
        if vp["x"] != hp["x"] or vp["y"] != hp["y"] or vp["z"] != hp["z"]:
            return {}, f"visual/hit mismatch drawer {i}"

    for name, ctype in CONTROLLERS.items():
        comps = [c for c in scene if isinstance(c, dict) and c.get("__type__") == ctype]
        if len(comps) != 1 or not comps[0].get("_enabled", False):
            return {}, f"controller check failed: {name}"

    closed_id, closed_node = find_nodes(scene, "EmployeeDrawersClosedRuntime")[0]
    canvas_id, canvas_node = find_nodes(scene, "Canvas")[0]
    canvas_names = [scene[cid(c)]["_name"] for c in canvas_node["_children"]]
    if "AppointmentRosterPanelRuntime" not in canvas_names or "Camera" not in canvas_names:
        return {}, "canvas anchor nodes missing"

    drawers: dict[str, Any] = {}
    for i in (1, 2, 3):
        visual_name = f"EmployeeDrawer0{i}Visual"
        _, visual = find_nodes(scene, visual_name)[0]
        ui = get_component(scene, visual, "cc.UITransform")
        width = ui["_contentSize"]["width"]
        drawers[visual_name] = {
            "position": deepcopy(visual["_lpos"]),
            "euler": deepcopy(visual["_euler"]),
            "scale": deepcopy(visual["_lscale"]),
            "width": width,
            "open_height": width * 674 / 1246,
        }

    return {
        "closed_runtime_id": closed_id,
        "closed_children_before": [cid(c) for c in closed_node["_children"]],
        "closed_children_names_before": [scene[cid(c)]["_name"] for c in closed_node["_children"]],
        "canvas_id": canvas_id,
        "canvas_children_before": [cid(c) for c in canvas_node["_children"]],
        "canvas_children_names_before": canvas_names,
        "drawers": drawers,
        "template_visual_id": find_nodes(scene, "EmployeeDrawer01Visual")[0][0],
        "panel_template_id": find_nodes(scene, "AppointmentRosterPanelRuntime")[0][0],
        "protected_before": {name: node_snapshot(scene, name) for name in PROTECTED_NODES},
        "controllers_before": controller_snapshot(scene),
    }, None


def new_id() -> str:
    return str(uuid_lib.uuid4())


def clone_component(comp: dict[str, Any], node_id: int) -> dict[str, Any]:
    cloned = deepcopy(comp)
    cloned["_id"] = new_id()
    cloned["node"] = {"__id__": node_id}
    if "_name" in cloned:
        cloned["_name"] = ""
    return cloned


def make_node(
    name: str,
    parent_id: int,
    active: bool,
    children: list[int],
    position: dict[str, Any] | None = None,
    euler: dict[str, Any] | None = None,
    scale: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "__type__": "cc.Node",
        "_name": name,
        "_objFlags": 0,
        "__editorExtras__": {},
        "_parent": {"__id__": parent_id},
        "_children": [{"__id__": c} for c in children],
        "_active": active,
        "_components": [],
        "_prefab": None,
        "_lpos": position or {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
        "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
        "_lscale": scale or {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
        "_mobility": 0,
        "_layer": 33554432,
        "_euler": euler or {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
        "_id": new_id(),
    }


def build_new_objects(scene: list[Any], ctx: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    base = len(scene)
    closed_runtime_id = ctx["closed_runtime_id"]
    canvas_id = ctx["canvas_id"]
    template_visual_id = ctx["template_visual_id"]
    panel_template_id = ctx["panel_template_id"]

    template_ui = get_component(scene, scene[template_visual_id], "cc.UITransform")
    template_sprite = get_component(scene, scene[template_visual_id], "cc.Sprite")
    panel_template_ui = get_component(scene, scene[panel_template_id], "cc.UITransform")

    ids = {
        "open_runtime_node": base,
        "open_runtime_ui": base + 1,
        "open01_node": base + 2,
        "open01_ui": base + 3,
        "open01_sprite": base + 4,
        "open02_node": base + 5,
        "open02_ui": base + 6,
        "open02_sprite": base + 7,
        "open03_node": base + 8,
        "open03_ui": base + 9,
        "open03_sprite": base + 10,
        "detail_panel_node": base + 11,
        "detail_panel_ui": base + 12,
        "detail_body_node": base + 13,
        "detail_body_ui": base + 14,
        "detail_body_sprite": base + 15,
    }

    open_runtime_node = make_node(
        "EmployeeDrawersOpenRuntime",
        closed_runtime_id,
        True,
        [ids["open01_node"], ids["open02_node"], ids["open03_node"]],
    )
    open_runtime_node["_components"] = [{"__id__": ids["open_runtime_ui"]}]
    open_runtime_ui = clone_component(panel_template_ui, ids["open_runtime_node"])
    open_runtime_ui["_contentSize"] = {"__type__": "cc.Size", "width": 720, "height": 1280}
    open_runtime_ui["_anchorPoint"] = {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5}

    open_specs = [
        ("EmployeeDrawer01OpenVisual", "EmployeeDrawer01Visual", "open01_node", "open01_ui", "open01_sprite"),
        ("EmployeeDrawer02OpenVisual", "EmployeeDrawer02Visual", "open02_node", "open02_ui", "open02_sprite"),
        ("EmployeeDrawer03OpenVisual", "EmployeeDrawer03Visual", "open03_node", "open03_ui", "open03_sprite"),
    ]
    open_entries: list[dict[str, Any]] = []
    open_nodes: list[dict[str, Any]] = []

    for open_name, closed_name, node_key, ui_key, sprite_key in open_specs:
        d = ctx["drawers"][closed_name]
        node_id = ids[node_key]
        ui_id = ids[ui_key]
        sprite_id = ids[sprite_key]
        node = make_node(
            open_name,
            ids["open_runtime_node"],
            False,
            [],
            d["position"],
            d["euler"],
            d["scale"],
        )
        node["_components"] = [{"__id__": ui_id}, {"__id__": sprite_id}]
        ui = clone_component(template_ui, node_id)
        ui["_contentSize"] = {"__type__": "cc.Size", "width": d["width"], "height": d["open_height"]}
        ui["_anchorPoint"] = {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5}
        sprite = clone_component(template_sprite, node_id)
        sprite["_spriteFrame"] = {"__uuid__": OPEN_SPRITE_UUID, "__expectedType__": "cc.SpriteFrame"}
        sprite["_type"] = 0
        sprite["_sizeMode"] = 0
        sprite["_color"] = {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255}
        open_nodes.extend([node, ui, sprite])
        open_entries.append(
            {
                "open_name": open_name,
                "closed_name": closed_name,
                "width": d["width"],
                "height": d["open_height"],
                "position": d["position"],
            }
        )

    detail_panel_node = make_node(
        "EmployeeFileDetailPanelRuntime",
        canvas_id,
        False,
        [ids["detail_body_node"]],
    )
    detail_panel_node["_components"] = [{"__id__": ids["detail_panel_ui"]}]
    detail_panel_ui = clone_component(panel_template_ui, ids["detail_panel_node"])
    detail_panel_ui["_contentSize"] = {"__type__": "cc.Size", "width": 720, "height": 1280}
    detail_panel_ui["_anchorPoint"] = {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5}

    detail_body_node = make_node(
        "EmployeeFileDetailBody",
        ids["detail_panel_node"],
        True,
        [],
    )
    detail_body_node["_components"] = [{"__id__": ids["detail_body_ui"]}, {"__id__": ids["detail_body_sprite"]}]
    detail_body_ui = clone_component(template_ui, ids["detail_body_node"])
    detail_height = 680 * 1611 / 978
    detail_body_ui["_contentSize"] = {"__type__": "cc.Size", "width": 680, "height": detail_height}
    detail_body_ui["_anchorPoint"] = {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5}
    detail_body_sprite = clone_component(template_sprite, ids["detail_body_node"])
    detail_body_sprite["_spriteFrame"] = {
        "__uuid__": DETAIL_SPRITE_UUID,
        "__expectedType__": "cc.SpriteFrame",
    }
    detail_body_sprite["_type"] = 0
    detail_body_sprite["_sizeMode"] = 0
    detail_body_sprite["_color"] = {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255}

    new_objects = [
        open_runtime_node,
        open_runtime_ui,
        *open_nodes,
        detail_panel_node,
        detail_panel_ui,
        detail_body_node,
        detail_body_ui,
        detail_body_sprite,
    ]

    meta = {
        "open_runtime_id": ids["open_runtime_node"],
        "detail_panel_id": ids["detail_panel_node"],
        "added_count": len(new_objects),
        "open_entries": open_entries,
        "detail_body_height": detail_height,
    }
    return new_objects, meta


def patch_children_array_by_name(raw_text: str, node_name: str, new_children_ids: list[int]) -> str:
    pattern = re.compile(
        rf'(\{{\s*"__type__": "cc\.Node",\s*\n\s*"_name": "{re.escape(node_name)}",[\s\S]*?"_children": )\[[\s\S]*?\]',
        re.MULTILINE,
    )
    children_json = json.dumps([{"__id__": c} for c in new_children_ids], ensure_ascii=False, indent=2)
    children_json = children_json.replace("\n", "\n    ")
    match = pattern.search(raw_text)
    if not match:
        raise RuntimeError(f"Failed to locate _children for node {node_name}")
    return raw_text[: match.start(1)] + match.group(1) + children_json + raw_text[match.end(0) :]


def insert_array_objects_before_closer(raw_text: str, new_objects_json: str) -> str:
    idx = raw_text.rfind("\n]")
    if idx == -1:
        raise RuntimeError("Could not find scene array closing bracket")
    return raw_text[:idx] + ",\n" + new_objects_json + raw_text[idx:]


def postflight(
    scene: list[Any],
    controllers_before: dict[str, Any],
    protected_before: dict[str, Any],
) -> tuple[bool, str, dict[str, Any]]:
    report: dict[str, Any] = {}

    for name in NEW_NODE_NAMES:
        if len(find_nodes(scene, name)) != 1:
            return False, f"post unique failed: {name}", report

    closed_names = [scene[cid(c)]["_name"] for c in find_nodes(scene, "EmployeeDrawersClosedRuntime")[0][1]["_children"]]
    if closed_names != [
        "EmployeeDrawersOpenRuntime",
        "EmployeeDrawer01Visual",
        "EmployeeDrawer02Visual",
        "EmployeeDrawer03Visual",
        "EmployeeDrawer01Hit",
        "EmployeeDrawer02Hit",
        "EmployeeDrawer03Hit",
    ]:
        return False, f"closed children order mismatch: {closed_names}", report

    open_runtime = find_nodes(scene, "EmployeeDrawersOpenRuntime")[0][1]
    if not open_runtime["_active"]:
        return False, "OpenRuntime must be active", report
    open_children = [scene[cid(c)]["_name"] for c in open_runtime["_children"]]
    if open_children != [
        "EmployeeDrawer01OpenVisual",
        "EmployeeDrawer02OpenVisual",
        "EmployeeDrawer03OpenVisual",
    ]:
        return False, f"open visual order mismatch: {open_children}", report

    for open_name in [
        "EmployeeDrawer01OpenVisual",
        "EmployeeDrawer02OpenVisual",
        "EmployeeDrawer03OpenVisual",
    ]:
        if find_nodes(scene, open_name)[0][1]["_active"]:
            return False, f"{open_name} must be inactive", report

    canvas_names = [scene[cid(c)]["_name"] for c in find_nodes(scene, "Canvas")[0][1]["_children"]]
    ap_idx = canvas_names.index("AppointmentRosterPanelRuntime")
    detail_idx = canvas_names.index("EmployeeFileDetailPanelRuntime")
    cam_idx = canvas_names.index("Camera")
    if not (ap_idx < detail_idx < cam_idx):
        return False, "canvas sibling order invalid", report

    if find_nodes(scene, "EmployeeFileDetailPanelRuntime")[0][1]["_active"]:
        return False, "detail panel must be inactive", report

    protected_after = {name: node_snapshot(scene, name) for name in PROTECTED_NODES}
    report["protected"] = {"before": protected_before, "after": protected_after}
    for name in PROTECTED_NODES:
        if protected_before[name] != protected_after[name]:
            return False, f"protected node changed: {name}", report

    controllers_after = controller_snapshot(scene)
    report["controllers"] = {"before": controllers_before, "after": controllers_after}
    for name in CONTROLLERS:
        if controllers_before[name] != controllers_after[name]:
            return False, f"controller changed: {name}", report

    report["open_table"] = []
    for i in (1, 2, 3):
        closed_name = f"EmployeeDrawer0{i}Visual"
        open_name = f"EmployeeDrawer0{i}OpenVisual"
        closed = node_snapshot(scene, closed_name)
        open_node = find_nodes(scene, open_name)[0][1]
        open_ui = get_component(scene, open_node, "cc.UITransform")
        open_sprite = get_component(scene, open_node, "cc.Sprite")
        report["open_table"].append(
            {
                "drawer": f"NO.{i}",
                "open_pos": open_node["_lpos"],
                "closed_pos": closed["position"],
                "pos_match": open_node["_lpos"] == closed["position"],
                "open_size": open_ui["_contentSize"],
                "closed_width": closed["size"]["width"],
                "width_match": open_ui["_contentSize"]["width"] == closed["size"]["width"],
                "sprite": open_sprite["_spriteFrame"]["__uuid__"],
                "active": open_node["_active"],
            }
        )

    detail_panel = find_nodes(scene, "EmployeeFileDetailPanelRuntime")[0][1]
    detail_panel_ui = get_component(scene, detail_panel, "cc.UITransform")
    detail_body = find_nodes(scene, "EmployeeFileDetailBody")[0][1]
    detail_body_ui = get_component(scene, detail_body, "cc.UITransform")
    detail_body_sprite = get_component(scene, detail_body, "cc.Sprite")
    report["detail"] = {
        "panel_active": detail_panel["_active"],
        "panel_size": detail_panel_ui["_contentSize"],
        "body_active": detail_body["_active"],
        "body_pos": detail_body["_lpos"],
        "body_size": detail_body_ui["_contentSize"],
        "body_sprite": detail_body_sprite["_spriteFrame"]["__uuid__"],
        "body_type": detail_body_sprite["_type"],
        "body_size_mode": detail_body_sprite["_sizeMode"],
    }
    report["object_count"] = len(scene)
    return True, "ok", report


def main() -> int:
    with open(SCENE_PATH, "rb") as f:
        original_raw = f.read()
    original_sha = sha256_bytes(original_raw)
    original_text = original_raw.decode("utf-8")
    scene = json.loads(original_text)

    ctx, err = preflight(scene)
    if err:
        print("PREFLIGHT_BLOCKED:", err)
        return 2

    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_path = os.path.join(BACKUP_DIR, BACKUP_NAME)
    with open(backup_path, "wb") as f:
        f.write(original_raw)
    backup_sha = sha256_file(backup_path)
    if backup_sha != original_sha:
        print("BACKUP_SHA_MISMATCH")
        return 3

    new_objects, meta = build_new_objects(scene, ctx)
    if len(new_objects) != 16:
        print("UNEXPECTED_OBJECT_COUNT", len(new_objects))
        return 5

    insertion = ",\n".join("  " + json.dumps(obj, ensure_ascii=False, separators=(",", ": ")) for obj in new_objects)
    modified_text = insert_array_objects_before_closer(original_text, insertion)

    new_closed_children = [meta["open_runtime_id"], *ctx["closed_children_before"]]
    modified_text = patch_children_array_by_name(
        modified_text, "EmployeeDrawersClosedRuntime", new_closed_children
    )

    canvas_children = ctx["canvas_children_before"]
    ap_idx = ctx["canvas_children_names_before"].index("AppointmentRosterPanelRuntime")
    new_canvas_children = canvas_children[: ap_idx + 1] + [meta["detail_panel_id"]] + canvas_children[ap_idx + 1 :]
    modified_text = patch_children_array_by_name(modified_text, "Canvas", new_canvas_children)

    verify_scene = json.loads(modified_text)
    ok, msg, report = postflight(verify_scene, ctx["controllers_before"], ctx["protected_before"])
    if not ok:
        with open(SCENE_PATH, "wb") as f:
            f.write(original_raw)
        if msg.startswith("protected node changed"):
            print("ROLLED_BACK_MANUAL_LAYOUT_PROTECTION")
        else:
            print("POSTFLIGHT_FAILED:", msg)
        print("RESTORE_SHA", sha256_file(SCENE_PATH), "ORIGINAL_SHA", original_sha)
        return 4

    with open(SCENE_PATH, "wb") as f:
        f.write(modified_text.encode("utf-8"))

    print("SUCCESS")
    print("ORIGINAL_SHA", original_sha)
    print("BACKUP_SHA", backup_sha)
    print("FINAL_SHA", sha256_file(SCENE_PATH))
    print("ADDED_OBJECTS", meta["added_count"])
    print("FINAL_OBJECT_COUNT", len(verify_scene))
    print("REPORT", json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
