"""Build the 40 FPS snowman atlases from the original pose sheets.

Requires Pillow, NumPy and opencv-python-headless.
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image


SOURCE = Path(__file__).resolve().parents[1] / 'frontend' / 'src'
SIZE = 128
COLUMNS = 16
SLOTS = 80
FRAME_MS = 25
SHEETS = {
    'home-snowman': [(200, True), (210, False), (240, False), (240, False), (240, False), (0, False)],
    'home-snowman-drag': [(190, True), (0, False), (165, False)],
    'home-snowman-gestures': [(310, False), (275, False), (230, False), (290, False)],
}


def load_poses(sheet, row):
    # The pinch reaction reuses the face row with an interaction-controlled phase.
    if row == 5:
        row = 3
    width = sheet.width // 6
    poses = []
    for column in range(6):
        tile = sheet.crop((column * width, row * width, (column + 1) * width, (row + 1) * width))
        rgba = np.asarray(tile.resize((SIZE, SIZE), Image.Resampling.LANCZOS), dtype=np.float32) / 255
        rgba[:, :, :3] *= rgba[:, :, 3:]
        poses.append(rgba)
    return poses


def compose(first, second, fraction, forward, backward, coordinates):
    first = cv2.remap(first, coordinates - forward * fraction, None, cv2.INTER_LINEAR)
    second = cv2.remap(second, coordinates - backward * (1 - fraction), None, cv2.INTER_LINEAR)
    # Favor the nearer pose where warped silhouettes or facial details disagree.
    # This keeps occluded outlines from showing through most of the transition.
    difference = np.max(np.abs(first - second), axis=2, keepdims=True)
    confidence = np.clip((difference - .12) / .55, 0, 1)
    handoff = np.clip((fraction - .33) / .34, 0, 1)
    handoff = handoff ** 2 * (3 - 2 * handoff)
    blend = fraction + confidence * (handoff - fraction)
    return first * (1 - blend) + second * blend


def render_poses(poses, frame_ms, loops, neutral, flow, coordinates):
    if frame_ms:
        phases = np.arange(0, frame_ms * 6, FRAME_MS) / frame_ms
    else:
        phases = np.linspace(0, 5, 51)
    if frame_ms:
        poses = [*poses, poses[0] if loops else neutral]
    guide = [cv2.cvtColor(np.uint8((pose[:, :, :3] + .22 * pose[:, :, 3:]) * 208), cv2.COLOR_RGB2GRAY)
             for pose in poses]
    for index in range(6):
        next_index = min(index + 1, len(poses) - 1)
        first, second = poses[index], poses[next_index]
        if index != next_index:
            forward = flow.calc(guide[index], guide[next_index], None)
            backward = flow.calc(guide[next_index], guide[index], None)
        for frame in phases[(phases >= index) & (phases < index + 1)]:
            fraction = float(frame - index)
            rgba = compose(first, second, fraction, forward, backward, coordinates) if fraction and index != next_index else first.copy()
            alpha = rgba[:, :, 3:]
            rgb = rgba[:, :, :3]
            np.divide(rgb, alpha, out=rgb, where=alpha > 0)
            yield Image.fromarray(np.uint8(np.clip(rgba * 255 + .5, 0, 255)))


def main():
    cv2.setNumThreads(2)
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    coordinates = np.stack(np.meshgrid(np.arange(SIZE), np.arange(SIZE)), axis=-1).astype(np.float32)
    with Image.open(SOURCE / 'home-snowman.png') as original:
        neutral = load_poses(original, 0)[0]
    for name, clips in SHEETS.items():
        with Image.open(SOURCE / f'{name}.png') as sheet:
            atlas = Image.new('RGBA', (COLUMNS * SIZE, len(clips) * (SLOTS // COLUMNS) * SIZE))
            for row, (frame_ms, loops) in enumerate(clips):
                frames = render_poses(load_poses(sheet, row), frame_ms, loops, neutral, flow, coordinates)
                for frame, image in enumerate(frames):
                    slot = row * SLOTS + frame
                    atlas.paste(image, (slot % COLUMNS * SIZE, slot // COLUMNS * SIZE))
            atlas.save(SOURCE / f'{name}-40fps.webp', quality=85, method=4)


if __name__ == '__main__':
    main()
