"""Render polished transparent mascot clips from the supplied LEGO Spider-Man model."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "lego-spiderman" / "source" / "Sketchfab_2021_02_07_15_47_50.blend"
TEXTURES = ROOT / "tmp" / "lego-spiderman" / "textures"
OUTPUT = ROOT / "tmp" / "lego-spiderman-animated"
FRAMES = OUTPUT / "frames"
PREVIEW = OUTPUT / "lego-spiderman-preview.png"
BLEND_FILE = ROOT / "assets" / "lego-spiderman-3d" / "lego-spiderman-animated.blend"
FPS = 15
TAU = math.tau
CLIPS = {"idle": 45, "walk": 45, "jump": 42, "wave": 45, "swing": 60}


def look_at(obj, target):
    obj.rotation_euler = ((Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler())


def add_area(name, location, energy, size, color, target=(0, 0, 2.6)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def make_web_material():
    mat = bpy.data.materials.new("Hero Web Blue")
    mat.diffuse_color = (0.025, 0.32, 0.72, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.025, 0.32, 0.72, 1)
    shader.inputs["Metallic"].default_value = 0.16
    shader.inputs["Roughness"].default_value = 0.24
    shader.inputs["Emission Color"].default_value = (0.015, 0.2, 0.6, 1)
    shader.inputs["Emission Strength"].default_value = 1.0
    return mat


def make_web(mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.09, depth=1.0)
    web = bpy.context.object
    web.name = "Animated_Web_Line"
    web.data.materials.append(mat)
    for polygon in web.data.polygons:
        polygon.use_smooth = True
    web.hide_render = True
    return web


def set_web(web, start, end):
    start, end = Vector(start), Vector(end)
    delta = end - start
    web.location = (start + end) / 2
    web.scale = (1, 1, delta.length)
    web.rotation_mode = "QUATERNION"
    web.rotation_quaternion = delta.to_track_quat("Z", "Y")
    web.hide_render = False


def relink_textures():
    replacements = {
        "spiderman_texture": TEXTURES / "spiderman_texture.png",
        "Fingerprints_07_1K.png": TEXTURES / "Fingerprints_07_1K@channels=G.png",
    }
    for image_name, path in replacements.items():
        image = bpy.data.images.get(image_name)
        if image and path.exists():
            image.filepath = str(path)
            image.reload()


def tune_material():
    mat = bpy.data.materials.get("lego")
    if not mat or not mat.use_nodes:
        return
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if not shader:
        return
    roughness = shader.inputs.get("Roughness")
    if roughness:
        for link in list(roughness.links):
            mat.node_tree.links.remove(link)
        roughness.default_value = 0.28
    metallic = shader.inputs.get("Metallic")
    if metallic:
        metallic.default_value = 0.04
    coat = shader.inputs.get("Coat Weight")
    if coat:
        coat.default_value = 0.22


def setup_scene():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    relink_textures()
    tune_material()

    armature = bpy.data.objects.get("Armature")
    mesh = bpy.data.objects.get("Lego_man")
    if not armature or not mesh:
        raise RuntimeError("The supplied LEGO Spider-Man mesh or armature is missing")

    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    subdivision = mesh.modifiers.get("Subdivision")
    if subdivision:
        subdivision.levels = 1
        subdivision.render_levels = 1

    motion = bpy.data.objects.new("CTRL_Mascot_Motion", None)
    bpy.context.collection.objects.link(motion)
    armature_world = armature.matrix_world.copy()
    armature.parent = motion
    armature.matrix_world = armature_world

    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.matrix_basis.identity()

    web = make_web(make_web_material())

    camera_data = bpy.data.cameras.new("Mascot_Camera")
    camera = bpy.data.objects.new("Mascot_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (14.0, -39.0, 11.0)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 20.5
    look_at(camera, (0, -0.18, 2.96))
    bpy.context.scene.camera = camera

    add_area("Mascot_Key", (-7, -9, 13), 1050, 6.0, (1.0, 0.72, 0.61))
    add_area("Mascot_Fill", (9, -5, 8), 780, 5.0, (0.48, 0.68, 1.0))
    add_area("Mascot_Rim", (-1, 7, 12), 1150, 5.0, (0.9, 0.12, 0.16))
    add_area("Mascot_Front", (0, -7, 4), 360, 4.0, (1.0, 1.0, 1.0))

    world = bpy.context.scene.world or bpy.data.worlds.new("Mascot World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.012, 0.018, 0.028, 1)
    background.inputs["Strength"].default_value = 0.12
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 360
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.fps = FPS
    scene.view_settings.look = "Medium High Contrast"

    return {"armature": armature, "mesh": mesh, "motion": motion, "web": web}


def reset_pose(controls):
    motion = controls["motion"]
    motion.location = (0, 0, 0)
    motion.rotation_mode = "XYZ"
    motion.rotation_euler = (0, 0, 0)
    motion.scale = (1, 1, 1)
    controls["web"].hide_render = True
    controls["web"].scale = (1, 1, 1)
    for pose_bone in controls["armature"].pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.view_layer.update()


def rotate_bone(controls, name, axis, angle):
    if abs(angle) < 1e-6:
        return
    bone = controls["armature"].pose.bones[name]
    pivot = bone.head.copy()
    transform = Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-pivot)
    bone.matrix = transform @ bone.matrix
    bpy.context.view_layer.update()


def hand_world(controls, bone_name):
    armature = controls["armature"]
    return armature.matrix_world @ armature.pose.bones[bone_name].tail


def ease_in_out(value):
    return value * value * (3 - 2 * value)


def apply_pose(controls, clip, phase):
    reset_pose(controls)
    motion = controls["motion"]
    wave = math.sin(phase * TAU)

    if clip == "idle":
        motion.location.z = 0.025 * math.sin(phase * TAU * 2)
        motion.rotation_euler.z = 0.018 * wave
        rotate_bone(controls, "Head", "Z", 0.12 * math.sin(phase * TAU * 0.5))
        rotate_bone(controls, "Shoulder.L", "Y", -0.05 * wave)
        rotate_bone(controls, "Shoulder.R", "Y", 0.05 * wave)

    elif clip == "walk":
        stride = math.sin(phase * TAU * 2)
        motion.location.z = 0.055 * abs(stride)
        motion.rotation_euler.z = 0.025 * stride
        rotate_bone(controls, "Leg.L", "X", 0.5 * stride)
        rotate_bone(controls, "Leg.R", "X", -0.5 * stride)
        rotate_bone(controls, "Leg.L", "Y", 0.09 * stride)
        rotate_bone(controls, "Leg.R", "Y", -0.09 * stride)
        rotate_bone(controls, "Shoulder.L", "X", -0.55 * stride)
        rotate_bone(controls, "Shoulder.R", "X", 0.55 * stride)
        rotate_bone(controls, "Torso", "Z", -0.045 * stride)
        rotate_bone(controls, "Head", "Z", 0.035 * stride)

    elif clip == "jump":
        if phase < 0.2:
            crouch = ease_in_out(phase / 0.2)
            motion.location.z = -0.16 * crouch
            motion.rotation_euler.x = 0.07 * crouch
            rotate_bone(controls, "Leg.L", "X", -0.38 * crouch)
            rotate_bone(controls, "Leg.R", "X", -0.38 * crouch)
            rotate_bone(controls, "Shoulder.L", "X", 0.35 * crouch)
            rotate_bone(controls, "Shoulder.R", "X", 0.35 * crouch)
        elif phase < 0.78:
            airborne = (phase - 0.2) / 0.58
            motion.location.z = 0.95 * math.sin(airborne * math.pi)
            motion.rotation_euler.y = -0.15 + 0.3 * airborne
            rotate_bone(controls, "Arm.L", "X", -1.18)
            rotate_bone(controls, "Arm.R", "X", -1.18)
            rotate_bone(controls, "Leg.L", "Y", -0.34)
            rotate_bone(controls, "Leg.R", "Y", 0.34)
            rotate_bone(controls, "Leg.L", "X", 0.22)
            rotate_bone(controls, "Leg.R", "X", -0.2)
        else:
            land = ease_in_out((phase - 0.78) / 0.22)
            motion.location.z = -0.12 * (1 - land)
            rotate_bone(controls, "Leg.L", "X", -0.25 * (1 - land))
            rotate_bone(controls, "Leg.R", "X", -0.25 * (1 - land))

    elif clip == "wave":
        rotate_bone(controls, "Shoulder.R", "Y", 1.18 + 0.12 * math.sin(phase * TAU * 3))
        rotate_bone(controls, "Arm.R", "X", -0.45)
        rotate_bone(controls, "Shoulder.L", "X", 0.12)
        rotate_bone(controls, "Head", "Z", 0.1)
        motion.location.z = 0.035 * math.sin(phase * TAU * 2)
        motion.rotation_euler.z = -0.02 * math.sin(phase * TAU * 3)

    elif clip == "swing":
        pendulum = math.sin(phase * TAU)
        motion.location.x = 0.62 * pendulum
        motion.location.z = 0.38 + 0.22 * math.cos(phase * TAU * 2)
        motion.rotation_euler.y = -0.18 * pendulum
        motion.rotation_euler.z = -0.2 * pendulum
        rotate_bone(controls, "Shoulder.R", "Y", 1.18 + 0.05 * wave)
        rotate_bone(controls, "Arm.R", "X", -0.45)
        rotate_bone(controls, "Shoulder.L", "Y", -0.3 - 0.06 * wave)
        rotate_bone(controls, "Arm.L", "X", 0.18)
        rotate_bone(controls, "Leg.L", "Y", -0.42 + 0.12 * wave)
        rotate_bone(controls, "Leg.R", "Y", 0.34 - 0.1 * wave)
        rotate_bone(controls, "Leg.L", "X", 0.28)
        rotate_bone(controls, "Leg.R", "X", -0.36)
        rotate_bone(controls, "Head", "Z", 0.1 * pendulum)
        # The supplied mesh uses a scaled bind pose, so the visible hand sits
        # offset from the raw bone tail. Map the strand to the rendered hand.
        hand = hand_world(controls, "Arm.R") + Vector((-2.0, 0.0, 2.0))
        anchor = hand + Vector((-3.45, 0.0, 5.4))
        set_web(controls["web"], hand, anchor)


def render_frame(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_preview(controls):
    apply_pose(controls, "swing", 0.18)
    render_frame(PREVIEW)


def render_diagnostics(controls):
    for label, bone, axis, angle in (
        ("arm-left-z-negative", "Arm.L", "Z", -1.7),
        ("arm-left-z-positive", "Arm.L", "Z", 1.7),
        ("arm-right-z-negative", "Arm.R", "Z", -1.7),
        ("arm-right-z-positive", "Arm.R", "Z", 1.7),
    ):
        reset_pose(controls)
        rotate_bone(controls, bone, axis, angle)
        render_frame(OUTPUT / "diagnostics" / f"{label}.png")


def render_action_previews(controls):
    for clip, phase in (("idle", 0.25), ("walk", 0.125), ("jump", 0.48), ("wave", 0.28), ("swing", 0.18)):
        apply_pose(controls, clip, phase)
        render_frame(OUTPUT / "action-previews" / f"{clip}.png")


def render_clip(controls, clip):
    count = CLIPS[clip]
    folder = FRAMES / clip
    folder.mkdir(parents=True, exist_ok=True)
    for index in range(count):
        apply_pose(controls, clip, index / count)
        render_frame(folder / f"{index:03d}.png")
        print(f"LEGO_SPIDERMAN_RENDER {clip} {index + 1}/{count}", flush=True)


def render_all(controls):
    for clip in CLIPS:
        render_clip(controls, clip)


def bake_showcase_timeline(controls):
    """Bake every procedural pose into Blender keyframes for direct playback."""
    scene = bpy.context.scene
    armature = controls["armature"]
    motion = controls["motion"]
    web = controls["web"]
    frame = 1
    scene.timeline_markers.clear()
    for clip, count in CLIPS.items():
        scene.timeline_markers.new(clip.upper(), frame=frame)
        for index in range(count):
            current = frame + index
            scene.frame_set(current)
            apply_pose(controls, clip, index / count)
            motion.keyframe_insert(data_path="location", frame=current)
            motion.keyframe_insert(data_path="rotation_euler", frame=current)
            motion.keyframe_insert(data_path="scale", frame=current)
            for pose_bone in armature.pose.bones:
                pose_bone.keyframe_insert(data_path="location", frame=current, group=pose_bone.name)
                pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=current, group=pose_bone.name)
                pose_bone.keyframe_insert(data_path="scale", frame=current, group=pose_bone.name)
            web.keyframe_insert(data_path="location", frame=current)
            web.keyframe_insert(data_path="rotation_quaternion", frame=current)
            web.keyframe_insert(data_path="scale", frame=current)
            web.keyframe_insert(data_path="hide_render", frame=current)
        frame += count + 8
    scene.frame_start = 1
    scene.frame_end = frame - 9
    scene.frame_set(1)
    if motion.animation_data and motion.animation_data.action:
        motion.animation_data.action.name = "Mascot Showcase Motion"
    if armature.animation_data and armature.animation_data.action:
        armature.animation_data.action.name = "LEGO Spider-Man Joint Animation"
    if web.animation_data and web.animation_data.action:
        web.animation_data.action.name = "Web Strand Animation"


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["--preview"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    BLEND_FILE.parent.mkdir(parents=True, exist_ok=True)
    controls = setup_scene()
    if "--render-all" in args:
        render_all(controls)
    elif "--render-swing" in args:
        render_clip(controls, "swing")
    elif "--diagnostic" in args:
        render_diagnostics(controls)
    elif "--action-previews" in args:
        render_action_previews(controls)
    elif "--save-rig" in args:
        pass
    else:
        render_preview(controls)
    bake_showcase_timeline(controls)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))


if __name__ == "__main__":
    main()
