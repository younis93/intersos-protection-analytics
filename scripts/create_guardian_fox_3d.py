"""Build and render the INTERSOS Guardian Fox as a reusable Blender scene.

Run with Blender:
  blender --background --python scripts/create_guardian_fox_3d.py -- --preview
  blender --background --python scripts/create_guardian_fox_3d.py -- --render-all
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tmp" / "guardian-fox-3d"
FRAMES = OUTPUT / "frames"
PREVIEW = OUTPUT / "guardian-fox-preview.png"
BLEND_FILE = ROOT / "assets" / "guardian-fox-3d" / "guardian-fox-rig.blend"
FPS = 12
TAU = math.tau


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.45, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = emission[0]
        principled.inputs["Emission Strength"].default_value = emission[1]
    return mat


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def preserve_parent(obj, parent):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = matrix
    bpy.context.view_layer.update()
    return obj


def empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.12
    if parent:
        obj.parent = parent
    obj.location = location
    return obj


def sphere(name, location, scale, mat, parent=None, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        preserve_parent(obj, parent)
    return obj


def cone(name, location, scale, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1, radius2=0.05, depth=2, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        preserve_parent(obj, parent)
    return obj


def cylinder_between(name, start, end, radius, mat, parent=None):
    start, end = Vector(start), Vector(end)
    delta = end - start
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=delta.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        preserve_parent(obj, parent)
    return obj


def torus(name, location, major_radius, minor_radius, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=40, minor_segments=12, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        preserve_parent(obj, parent)
    return obj


def build_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass

    orange = material("Fox Orange", (0.95, 0.25, 0.035, 1), roughness=0.5)
    orange_dark = material("Fox Dark Orange", (0.5, 0.09, 0.025, 1), roughness=0.55)
    cream = material("Warm Cream", (1.0, 0.73, 0.42, 1), roughness=0.6)
    red = material("INTERSOS Scarf Red", (0.72, 0.018, 0.025, 1), roughness=0.48)
    white = material("Eye White", (0.98, 0.98, 0.95, 1), roughness=0.22)
    black = material("Eye Black", (0.012, 0.008, 0.006, 1), roughness=0.18)
    brown = material("Paws and Nose", (0.18, 0.035, 0.018, 1), roughness=0.42)
    gold = material("Lantern Gold", (0.46, 0.18, 0.025, 1), metallic=0.78, roughness=0.24)
    glow = material("Lantern Glow", (1.0, 0.42, 0.05, 1), roughness=0.2, emission=((1.0, 0.22, 0.02, 1), 6.0))

    rig = empty("RIG_GuardianFox", (0, 0, 0))
    root = empty("CTRL_Root", (0, 0, 0), rig)
    body_ctrl = empty("CTRL_Body", (0, 0, 2.35), root)
    head_ctrl = empty("CTRL_Head", (0, 0, 3.55), root)
    arm_l = empty("CTRL_Arm.L", (-0.68, -0.58, 3.1), root)
    arm_r = empty("CTRL_Arm.R", (0.68, -0.58, 3.1), root)
    leg_l = empty("CTRL_Leg.L", (-0.42, 0, 1.72), root)
    leg_r = empty("CTRL_Leg.R", (0.42, 0, 1.72), root)
    tail_ctrl = empty("CTRL_Tail", (-0.56, 0.12, 1.75), root)
    scarf_ctrl = empty("CTRL_Scarf", (0, 0, 3.22), root)

    sphere("Body", (0, 0, 2.35), (0.78, 0.56, 1.05), orange, body_ctrl)
    sphere("Belly", (0, -0.52, 2.28), (0.49, 0.15, 0.78), cream, body_ctrl)
    sphere("Chest", (0, -0.48, 2.91), (0.54, 0.15, 0.46), cream, body_ctrl)

    sphere("Head", (0, 0, 3.96), (0.93, 0.73, 0.82), orange, head_ctrl)
    sphere("Cheek.L", (-0.34, -0.61, 3.73), (0.48, 0.24, 0.34), cream, head_ctrl)
    sphere("Cheek.R", (0.34, -0.61, 3.73), (0.48, 0.24, 0.34), cream, head_ctrl)
    sphere("Muzzle", (0, -0.78, 3.65), (0.38, 0.21, 0.28), cream, head_ctrl)
    sphere("Nose", (0, -1.0, 3.78), (0.22, 0.14, 0.15), brown, head_ctrl)
    sphere("Smile", (0, -0.93, 3.48), (0.22, 0.08, 0.11), black, head_ctrl)

    cone("Ear.L", (-0.59, 0.04, 4.74), (0.37, 0.28, 0.58), orange_dark, head_ctrl, rotation=(0, 0.08, -0.13))
    cone("Ear.R", (0.59, 0.04, 4.74), (0.37, 0.28, 0.58), orange_dark, head_ctrl, rotation=(0, -0.08, 0.13))
    cone("EarInner.L", (-0.59, -0.24, 4.72), (0.22, 0.08, 0.38), cream, head_ctrl, rotation=(0, 0.08, -0.13))
    cone("EarInner.R", (0.59, -0.24, 4.72), (0.22, 0.08, 0.38), cream, head_ctrl, rotation=(0, -0.08, 0.13))

    eyes = []
    for side, x in (("L", -0.34), ("R", 0.34)):
        eye = sphere(f"Eye.{side}", (x, -0.69, 4.08), (0.25, 0.13, 0.31), white, head_ctrl)
        pupil = sphere(f"Pupil.{side}", (x * 1.06, -0.82, 4.06), (0.115, 0.07, 0.17), black, head_ctrl)
        shine = sphere(f"EyeShine.{side}", (x * 1.08 - 0.035, -0.89, 4.14), (0.035, 0.025, 0.045), white, head_ctrl, segments=20)
        eyes.extend((eye, pupil, shine))

    for side, pivot, x in (("L", arm_l, -0.68), ("R", arm_r, 0.68)):
        sphere(f"Shoulder.{side}", (x, -0.47, 3.08), (0.34, 0.3, 0.38), orange, root)
        arm_mesh = sphere(f"Arm.{side}", (0, 0, 0), (0.25, 0.25, 0.68), orange)
        arm_mesh.parent = pivot
        arm_mesh.location = (0, -0.1, -0.47)
        paw_mesh = sphere(f"Paw.{side}", (0, 0, 0), (0.27, 0.25, 0.28), brown)
        paw_mesh.parent = pivot
        paw_mesh.location = (0, -0.18, -1.02)
    for side, pivot, x in (("L", leg_l, -0.42), ("R", leg_r, 0.42)):
        sphere(f"Hip.{side}", (x, -0.05, 1.68), (0.39, 0.36, 0.42), orange, root)
        leg_mesh = sphere(f"Leg.{side}", (0, 0, 0), (0.32, 0.34, 0.7), orange)
        leg_mesh.parent = pivot
        leg_mesh.location = (0, 0, -0.56)
        foot_mesh = sphere(f"Foot.{side}", (0, 0, 0), (0.38, 0.48, 0.24), brown)
        foot_mesh.parent = pivot
        foot_mesh.location = (0, -0.24, -1.1)

    sphere("Tail.01", (-1.08, 0.16, 1.87), (0.66, 0.42, 0.52), orange, tail_ctrl)
    sphere("Tail.02", (-1.58, 0.2, 2.12), (0.65, 0.4, 0.46), orange, tail_ctrl)
    sphere("TailTip", (-1.98, 0.18, 2.38), (0.48, 0.36, 0.38), cream, tail_ctrl)

    torus("ScarfCollar", (0, -0.02, 3.22), 0.63, 0.17, red, scarf_ctrl)
    sphere("ScarfTail.01", (-0.67, 0.14, 3.0), (0.42, 0.12, 0.17), red, scarf_ctrl)
    sphere("ScarfTail.02", (-1.03, 0.16, 2.89), (0.39, 0.1, 0.14), red, scarf_ctrl)

    lantern = empty("PROP_Lantern", (0, -0.95, 2.25), root)
    lantern_objects = []
    lantern_objects.append(sphere("LanternLight", (0, -0.96, 2.28), (0.28, 0.2, 0.35), glow, lantern, segments=24))
    lantern_objects.append(cylinder_between("LanternTop", (-0.34, -0.96, 2.63), (0.34, -0.96, 2.63), 0.07, gold, lantern))
    lantern_objects.append(cylinder_between("LanternBottom", (-0.34, -0.96, 1.92), (0.34, -0.96, 1.92), 0.07, gold, lantern))
    for x in (-0.31, 0.31):
        lantern_objects.append(cylinder_between(f"LanternBar{x}", (x, -0.96, 1.95), (x, -0.96, 2.6), 0.035, gold, lantern))
    torus("LanternHandle", (0, -0.96, 2.74), 0.25, 0.04, gold, lantern, rotation=(math.pi / 2, 0, 0))
    point_data = bpy.data.lights.new("LanternPoint", type="POINT")
    point_data.color = (1.0, 0.23, 0.035)
    point_data.energy = 0
    point_data.shadow_soft_size = 1.1
    point = bpy.data.objects.new("LanternPoint", point_data)
    bpy.context.collection.objects.link(point)
    point.location = (0, -1.2, 2.32)
    preserve_parent(point, lantern)
    lantern_objects.extend((bpy.data.objects["LanternHandle"], point))

    ground = None
    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -12.5, 3.0)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 6.2
    camera.rotation_euler = ((Vector((0, 0, 2.75)) - camera.location).to_track_quat("-Z", "Y").to_euler())
    bpy.context.scene.camera = camera

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = ((Vector((0, 0, 2.7)) - obj.location).to_track_quat("-Z", "Y").to_euler())
        return obj

    area("KeyLight", (-4, -6, 7), 900, 5.0, (1.0, 0.72, 0.5))
    area("FillLight", (4, -4, 4), 600, 4.0, (0.42, 0.65, 1.0))
    area("RimLight", (0, 3, 6), 1000, 3.5, (1.0, 0.24, 0.08))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 320
    scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.render.fps = FPS
    scene.render.film_transparent = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.035, 0.045, 0.065)

    controls = {"rig": rig, "root": root, "body": body_ctrl, "head": head_ctrl, "arm_l": arm_l, "arm_r": arm_r, "leg_l": leg_l, "leg_r": leg_r, "tail": tail_ctrl, "scarf": scarf_ctrl, "lantern": lantern, "lantern_objects": lantern_objects, "lantern_light": point, "eyes": eyes}
    controls["base"] = {name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy()) for name, obj in controls.items() if isinstance(obj, bpy.types.Object)}
    return controls


def reset_pose(c):
    for name, transform in c["base"].items():
        obj = c[name]
        obj.location, obj.rotation_euler, obj.scale = transform[0].copy(), transform[1].copy(), transform[2].copy()
    for eye in c["eyes"]:
        eye.scale = (1, 1, 1)
    for obj in c["lantern_objects"]:
        obj.hide_render = True
    c["lantern_light"].data.energy = 0


def animate_pose(c, clip: str, phase: float):
    reset_pose(c)
    wave = math.sin(phase * TAU)
    bounce = math.sin(phase * TAU * 2)
    if clip == "idle":
        c["root"].scale.z = 1 + 0.018 * wave
        c["head"].rotation_euler.y = 0.05 * math.sin(phase * TAU * 0.5)
        c["tail"].rotation_euler.y = 0.12 * wave
        if 0.46 < phase < 0.5 or 0.82 < phase < 0.86:
            for eye in c["eyes"]:
                eye.scale.z = 0.08
    elif clip in {"walk", "run"}:
        speed = 2 if clip == "walk" else 3
        stride = math.sin(phase * TAU * speed)
        amount = 0.46 if clip == "walk" else 0.72
        c["leg_l"].rotation_euler.y = amount * stride
        c["leg_r"].rotation_euler.y = -amount * stride
        c["arm_l"].rotation_euler.y = -amount * 0.75 * stride
        c["arm_r"].rotation_euler.y = amount * 0.75 * stride
        c["root"].location.z = abs(stride) * (0.08 if clip == "walk" else 0.14)
        c["root"].rotation_euler.y = -0.05 if clip == "run" else 0
        c["tail"].rotation_euler.y = -0.18 * stride
        c["scarf"].rotation_euler.y = 0.12 * stride
    elif clip == "jump":
        if phase < 0.18:
            t = phase / 0.18
            c["root"].scale.z = 1 - 0.2 * t
            c["leg_l"].rotation_euler.y = c["leg_r"].rotation_euler.y = -0.45 * t
        elif phase < 0.72:
            t = (phase - 0.18) / 0.54
            c["root"].location.z = math.sin(t * math.pi) * 1.25
            c["root"].rotation_euler.y = -0.18 + 0.36 * t
            c["arm_l"].rotation_euler.y = c["arm_r"].rotation_euler.y = -1.0
            c["leg_l"].rotation_euler.y = 0.6
            c["leg_r"].rotation_euler.y = -0.5
            c["tail"].rotation_euler.y = 0.45 * math.sin(t * math.pi)
        else:
            t = (phase - 0.72) / 0.28
            c["root"].scale.z = 0.82 + 0.18 * min(1, t * 2)
            c["root"].location.z = -0.04 * math.sin(t * math.pi)
    elif clip == "spin":
        c["root"].rotation_euler.z = phase * TAU
        c["root"].location.z = 0.16 * math.sin(phase * math.pi)
        c["arm_l"].rotation_euler.y = -1.05
        c["arm_r"].rotation_euler.y = 1.05
        c["tail"].rotation_euler.z = 0.3 * wave
    elif clip == "wave":
        c["arm_l"].rotation_euler.y = 2.55
        c["arm_l"].rotation_euler.z = -0.28 - 0.25 * math.sin(phase * TAU * 3)
        c["head"].rotation_euler.y = -0.08
        c["head"].rotation_euler.z = 0.08 * wave
        c["root"].location.z = 0.04 * bounce
        c["tail"].rotation_euler.y = 0.18 * wave
    elif clip == "lantern":
        for obj in c["lantern_objects"]:
            obj.hide_render = False
        c["lantern_light"].data.energy = 85 + 70 * (0.5 + 0.5 * wave)
        c["arm_l"].rotation_euler.y = -0.38
        c["arm_r"].rotation_euler.y = -0.38
        c["root"].scale.z = 1 + 0.015 * wave
        c["head"].rotation_euler.y = 0.08 * math.sin(phase * TAU * 0.5)
        if 0.62 < phase < 0.68:
            for eye in c["eyes"]:
                eye.scale.z = 0.08


CLIPS = {"idle": 30, "walk": 30, "run": 24, "jump": 30, "spin": 24, "wave": 30, "lantern": 30}


def render_frame(scene, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_preview(c):
    animate_pose(c, "wave", 0.18)
    render_frame(bpy.context.scene, PREVIEW)


def render_all(c):
    scene = bpy.context.scene
    for clip, count in CLIPS.items():
        folder = FRAMES / clip
        folder.mkdir(parents=True, exist_ok=True)
        for index in range(count):
            phase = index / count
            animate_pose(c, clip, phase)
            render_frame(scene, folder / f"{index:03d}.png")
            print(f"FOX_RENDER {clip} {index + 1}/{count}", flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["--preview"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    BLEND_FILE.parent.mkdir(parents=True, exist_ok=True)
    controls = build_scene()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))
    if "--render-all" in args:
        render_all(controls)
    else:
        render_preview(controls)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))


if __name__ == "__main__":
    main()
