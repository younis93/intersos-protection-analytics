"""Build and render a brick-style Spider-Man mascot for the INTERSOS app."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tmp" / "spider-mascot-3d"
FRAMES = OUTPUT / "frames"
PREVIEW = OUTPUT / "spider-mascot-preview.png"
BLEND_FILE = ROOT / "assets" / "spider-mascot-3d" / "spider-mascot-rig.blend"
FPS = 12
TAU = math.tau


def material(name, color, metallic=0.0, roughness=0.42, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = emission[0]
        shader.inputs["Emission Strength"].default_value = emission[1]
    return mat


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.11
    if parent:
        obj.parent = parent
    obj.location = location
    return obj


def parent_local(obj, parent, location):
    obj.parent = parent
    obj.location = location
    return obj


def cube(name, location, scale, mat, parent=None, bevel=0.12):
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0) if parent else location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft brick edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    if parent:
        parent_local(obj, parent, location)
    return obj


def sphere(name, location, scale, mat, parent=None, segments=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=14, location=(0, 0, 0) if parent else location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        parent_local(obj, parent, location)
    return obj


def cylinder(name, location, radius, depth, mat, parent=None, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, 0) if parent else location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        parent_local(obj, parent, location)
    return obj


def torus(name, location, major_radius, minor_radius, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=32, minor_segments=10, location=(0, 0, 0) if parent else location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        parent_local(obj, parent, location)
    return obj


def cylinder_between(name, start, end, radius, mat):
    start, end = Vector(start), Vector(end)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=delta.length, location=(start + end) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj["base_depth"] = delta.length
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def set_cylinder_between(obj, start, end):
    start, end = Vector(start), Vector(end)
    delta = end - start
    obj.location = (start + end) / 2
    obj.scale = (1, 1, delta.length / float(obj["base_depth"]))
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")


def build_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    red = material("Spider Red", (0.72, 0.008, 0.018, 1), roughness=0.38)
    red_dark = material("Web Red Shadow", (0.29, 0.002, 0.008, 1), roughness=0.45)
    blue = material("Spider Blue", (0.015, 0.09, 0.48, 1), metallic=0.05, roughness=0.34)
    black = material("Mask Lines", (0.008, 0.008, 0.012, 1), roughness=0.3)
    white = material("Mask Eyes", (0.98, 0.99, 1.0, 1), roughness=0.18)
    web_mat = material("Web Strand", (0.025, 0.28, 0.68, 1), metallic=0.12, roughness=0.24, emission=((0.02, 0.22, 0.62, 1), 0.65))

    rig = empty("RIG_SpiderMascot", (0, 0, 0))
    root = empty("CTRL_Root", (0, 0, 0), rig)
    torso = empty("CTRL_Torso", (0, 0, 2.75), root)
    head = empty("CTRL_Head", (0, 0, 4.02), root)
    arm_l = empty("CTRL_Arm.L", (-0.73, -0.14, 3.18), root)
    arm_r = empty("CTRL_Arm.R", (0.73, -0.14, 3.18), root)
    leg_l = empty("CTRL_Leg.L", (-0.3, 0, 1.82), root)
    leg_r = empty("CTRL_Leg.R", (0.3, 0, 1.82), root)

    cube("Torso", (0, 0, 0), (0.67, 0.42, 0.68), red, torso, bevel=0.14)
    cube("TorsoBlue.L", (-0.5, -0.43, -0.03), (0.14, 0.035, 0.5), blue, torso, bevel=0.04)
    cube("TorsoBlue.R", (0.5, -0.43, -0.03), (0.14, 0.035, 0.5), blue, torso, bevel=0.04)
    cube("Waist", (0, 0, -0.82), (0.62, 0.39, 0.18), blue, torso, bevel=0.08)

    cylinder("MaskHead", (0, 0, 0), 0.58, 0.82, red, head, rotation=(math.pi / 2, 0, 0))
    # Bold minifigure-style mask eyes with a black border and white inset.
    for side, x, angle in (("L", -0.23, -0.2), ("R", 0.23, 0.2)):
        border = sphere(f"EyeBorder.{side}", (x, -0.58, 0.07), (0.21, 0.055, 0.31), black, head)
        border.rotation_euler.y = angle
        inset = sphere(f"EyeWhite.{side}", (x, -0.635, 0.07), (0.15, 0.035, 0.24), white, head)
        inset.rotation_euler.y = angle

    # Printed spider emblem and simple radiating web accents.
    sphere("ChestSpider", (0, -0.445, 0.02), (0.12, 0.025, 0.21), black, torso, segments=20)
    for index, (sx, sz, ex, ez) in enumerate(((-0.08, 0.1, -0.28, 0.28), (0.08, 0.1, 0.28, 0.28), (-0.08, -0.08, -0.3, -0.24), (0.08, -0.08, 0.3, -0.24))):
        line = cylinder_between(f"SpiderLeg.{index}", (sx, -0.46, sz + 2.75), (ex, -0.46, ez + 2.75), 0.025, black)
        world = line.matrix_world.copy()
        line.parent = torso
        line.matrix_parent_inverse = torso.matrix_world.inverted()
        line.matrix_world = world

    hands = {}
    for side, pivot in (("L", arm_l), ("R", arm_r)):
        sphere(f"Shoulder.{side}", (0, 0, 0), (0.3, 0.3, 0.32), red, pivot)
        cube(f"Arm.{side}", (0, -0.03, -0.43), (0.22, 0.24, 0.49), red, pivot, bevel=0.18)
        hands[side] = torus(f"Hand.{side}", (0, -0.08, -0.9), 0.2, 0.09, red, pivot, rotation=(math.pi / 2, 0, 0))
    for side, pivot in (("L", leg_l), ("R", leg_r)):
        cube(f"Leg.{side}", (0, 0, -0.53), (0.27, 0.34, 0.59), blue, pivot, bevel=0.11)
        cube(f"Boot.{side}", (0, -0.17, -1.05), (0.3, 0.43, 0.25), red, pivot, bevel=0.1)

    web = cylinder_between("WebLine", (0.72, -0.42, 4.0), (-1.65, -0.42, 6.2), 0.04, web_mat)
    web.hide_render = True

    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -12.5, 3.05)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 6.25
    camera.rotation_euler = ((Vector((0, 0, 2.8)) - camera.location).to_track_quat("-Z", "Y").to_euler())
    bpy.context.scene.camera = camera

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = ((Vector((0, 0, 2.8)) - obj.location).to_track_quat("-Z", "Y").to_euler())

    area("KeyLight", (-4, -6, 7), 950, 5.0, (1.0, 0.68, 0.56))
    area("FillLight", (4, -4, 4), 650, 4.0, (0.35, 0.58, 1.0))
    area("RimLight", (0, 3, 6), 900, 3.0, (0.9, 0.08, 0.12))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 320
    scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.fps = FPS
    scene.view_settings.look = "AgX - Medium High Contrast"

    controls = {
        "root": root,
        "torso": torso,
        "head": head,
        "arm_l": arm_l,
        "arm_r": arm_r,
        "leg_l": leg_l,
        "leg_r": leg_r,
        "hand_l": hands["L"],
        "hand_r": hands["R"],
        "web": web,
    }
    controls["base"] = {name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy()) for name, obj in controls.items() if isinstance(obj, bpy.types.Object)}
    return controls


def reset_pose(c):
    for name, transform in c["base"].items():
        obj = c[name]
        obj.location, obj.rotation_euler, obj.scale = transform[0].copy(), transform[1].copy(), transform[2].copy()
    c["web"].hide_render = True


def animate_pose(c, clip, phase):
    reset_pose(c)
    wave = math.sin(phase * TAU)
    if clip == "idle":
        c["root"].scale.z = 1 + 0.018 * wave
        c["head"].rotation_euler.y = 0.07 * math.sin(phase * math.pi)
    elif clip == "walk":
        stride = math.sin(phase * TAU * 2)
        c["leg_l"].rotation_euler.y = 0.5 * stride
        c["leg_r"].rotation_euler.y = -0.5 * stride
        c["arm_l"].rotation_euler.y = -0.42 * stride
        c["arm_r"].rotation_euler.y = 0.42 * stride
        c["root"].location.z = 0.08 * abs(stride)
    elif clip == "jump":
        if phase < 0.2:
            t = phase / 0.2
            c["root"].scale.z = 1 - 0.18 * t
            c["leg_l"].rotation_euler.y = c["leg_r"].rotation_euler.y = -0.38 * t
        elif phase < 0.75:
            t = (phase - 0.2) / 0.55
            c["root"].location.z = 1.2 * math.sin(t * math.pi)
            c["root"].rotation_euler.y = -0.18 + 0.36 * t
            c["arm_l"].rotation_euler.y = 2.25
            c["arm_r"].rotation_euler.y = -2.25
            c["leg_l"].rotation_euler.y = 0.62
            c["leg_r"].rotation_euler.y = -0.55
        else:
            c["root"].scale.z = 0.84 + 0.16 * min(1, (phase - 0.75) * 8)
    elif clip == "wave":
        c["arm_l"].rotation_euler.y = 2.58
        c["arm_l"].rotation_euler.z = -0.2 - 0.24 * math.sin(phase * TAU * 3)
        c["head"].rotation_euler.y = -0.08
        c["root"].location.z = 0.04 * math.sin(phase * TAU * 2)
    elif clip == "swing":
        # Pendulum movement driven from the web anchor above the frame.
        arc = math.sin((phase - 0.25) * math.pi)
        c["root"].location.x = 0.78 * math.sin(phase * TAU)
        c["root"].location.z = 0.42 + 0.48 * (1 - abs(math.sin(phase * TAU)))
        c["root"].rotation_euler.y = -0.48 * arc
        c["arm_l"].rotation_euler.y = 2.72
        c["arm_r"].rotation_euler.y = -2.4
        c["leg_l"].rotation_euler.y = 0.55 + 0.18 * wave
        c["leg_r"].rotation_euler.y = -0.68 - 0.16 * wave
        c["head"].rotation_euler.y = 0.12 * arc
        c["web"].hide_render = False
        bpy.context.view_layer.update()
        hand = c["hand_l"].matrix_world.translation
        anchor = (hand.x - 1.45, hand.y, hand.z + 2.4)
        set_cylinder_between(c["web"], hand, anchor)


CLIPS = {"idle": 30, "walk": 30, "jump": 30, "wave": 30, "swing": 42}


def render_frame(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_preview(c):
    animate_pose(c, "swing", 0.35)
    render_frame(PREVIEW)


def render_all(c):
    for clip, count in CLIPS.items():
        folder = FRAMES / clip
        folder.mkdir(parents=True, exist_ok=True)
        for index in range(count):
            animate_pose(c, clip, index / count)
            render_frame(folder / f"{index:03d}.png")
            print(f"SPIDER_RENDER {clip} {index + 1}/{count}", flush=True)


def render_clip(c, clip):
    count = CLIPS[clip]
    folder = FRAMES / clip
    folder.mkdir(parents=True, exist_ok=True)
    for index in range(count):
        animate_pose(c, clip, index / count)
        render_frame(folder / f"{index:03d}.png")
        print(f"SPIDER_RENDER {clip} {index + 1}/{count}", flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["--preview"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    BLEND_FILE.parent.mkdir(parents=True, exist_ok=True)
    controls = build_scene()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))
    if "--render-all" in args:
        render_all(controls)
    elif "--render-swing" in args:
        render_clip(controls, "swing")
    else:
        render_preview(controls)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))


if __name__ == "__main__":
    main()
