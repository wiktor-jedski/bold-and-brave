"""Fresh ranger motion for the +Z-aligned bones in author-ranger.py.

Call once on the freshly built neutral rig:
    clips = runpy.run_path(str(ROOT / 'assets/ranger_animation.py'))['build'](rig, scene)

Preview: unmute only the desired returned track, then scene.frame_set(frame).
Use frames [frame_start, frame_end - 1] for repeated timeline playback: the
last key duplicates the first for interpolation/export, not an extra hold.

Export both clips after inspection (retain Main's object/material options):
    rig.animation_data.action = None
    for clip in clips:
        track = rig.animation_data.nla_tracks[clip['track']]
        track.is_solo = False
        track.mute = False
    bpy.ops.export_scene.gltf(
        filepath=..., export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_frame_range=False,
        export_force_sampling=True, export_frame_step=1,
        export_anim_slide_to_zero=True, export_rest_position_armature=True,
        export_current_frame=False)

Do not preview with both tracks enabled: REPLACE tracks overlap; the upper
track wins. NLA_TRACKS export samples each track separately. Afterwards mute
both tracks, clear the active action, reset pose-bone matrix_basis to identity,
and update the view layer to restore neutral inspection. Muting alone does not
necessarily clear the last evaluated pose. Never reset equipment EMPTY matrices.

This is in-place FK, not planted-foot IK. Inspect sole contact/sliding against
game speed, knee deformation, cloak/leg overlap, and sword/shield clearance.
Equipment has no keys or transform edits; it follows its hand/forearm parent.
"""

import math

import bpy
from mathutils import Euler


def _walk(phase):
    c, s = math.cos(phase), math.sin(phase)
    rotations = {
        'Hips': (.008 * math.sin(2 * phase), .028 * c, .012 * s),
        'Torso': (-.018, -.045 * c, -.008 * s),
        'Head': (.010, .014 * c, -.004 * s),
        'Cloak': (.018 + .018 * math.sin(2 * phase - .4), -.010 * c, .008 * s),
        'Helmet': (0, 0, 0),
    }
    for side, offset, outward in (('Right', 0, -1), ('Left', math.pi, 1)):
        p = phase + offset
        # Forward is Blender -Y. Positive local X swings a leg backward;
        # positive shin X bends the knee backward, NOT toward the face.
        stride = math.cos(p)
        swing = max(0.0, -math.sin(p)) ** 2
        thigh = -.32 * stride
        knee = .035 + .60 * swing
        rotations[side + 'Leg'] = (thigh, 0, 0)
        rotations[side + 'Shin'] = (knee, 0, 0)
        # Counter the thigh/knee, with heel strike and toe-off roll.
        rotations[side + 'Foot'] = (
            -thigh - knee + .10 * math.sin(p) - .09 * stride, 0, 0)
        rotations[side + 'Arm'] = (.19 * stride, .012 * math.sin(p), outward * .025)
        rotations[side + 'Forearm'] = (-.08 - .055 * (1 - stride), 0, 0)
        rotations[side + 'Hand'] = (.018 * math.sin(p - .35), 0, 0)
    return rotations, (0, 0, 0)


def _idle(phase):
    breath, sway = math.sin(phase), math.sin(phase - .5)
    rotations = {
        'Hips': (0, .004 * sway, .003 * sway),
        'Torso': (-.004 * breath, -.007 * sway, -.003 * sway),
        'Head': (.003 * math.sin(phase - .25), .009 * sway, 0),
        'Cloak': (.004 * math.sin(phase - .4), 0, .002 * sway),
        'Helmet': (0, 0, 0),
    }
    for side, outward in (('Right', -1), ('Left', 1)):
        rotations[side + 'Arm'] = (.005 * breath, 0, outward * .004 * breath)
        rotations[side + 'Forearm'] = (-.025 - .004 * breath, 0, 0)
        rotations[side + 'Hand'] = (.003 * math.sin(phase - .3), 0, 0)
        rotations[side + 'Leg'] = (0, 0, 0)
        rotations[side + 'Shin'] = (0, 0, 0)
        rotations[side + 'Foot'] = (0, 0, 0)
    return rotations, (0, .0015 * breath, 0)


def _walk_grounding(rig, scene):
    names = ('Hips', 'RightLeg', 'RightShin', 'RightFoot',
             'LeftLeg', 'LeftShin', 'LeftFoot')
    bones = rig.data.bones
    inverse = {name: bones[name].matrix_local.inverted() for name in names}
    relative = {
        name: inverse[bones[name].parent.name] @ bones[name].matrix_local
        if bones[name].parent else bones[name].matrix_local.copy()
        for name in names
    }
    soles = {'LeftFoot': [], 'RightFoot': []}
    for obj in scene.objects:
        if obj.type != 'MESH' or not any(
                material and material.get('ranger_material') == 'Sole'
                for material in obj.data.materials):
            continue
        foot = {'leg.L': 'LeftFoot', 'leg.R': 'RightFoot'}[obj['ranger_deform']]
        soles[foot].extend(obj.matrix_local @ vertex.co for vertex in obj.data.vertices)

    def height(rotations):
        poses = {}
        for name in names:
            parent = bones[name].parent
            base = poses[parent.name] @ relative[name] if parent else relative[name]
            poses[name] = base @ Euler(rotations[name], 'XYZ').to_matrix().to_4x4()
        lowest = float('inf')
        for foot, points in soles.items():
            transform = poses[foot] @ inverse[foot]
            lowest = min(lowest, min((transform @ point).z for point in points))
        return .004 - lowest

    return height


def build(rig, scene):
    """Return clip metadata; leave the fresh rig neutral and both tracks muted.

    Scene FPS is respected and not changed. Rotation mode becomes XYZ; bone
    basis matrices are preserved. The fresh rig must not already be animated.
    No armature object or equipment object transforms are keyed or assigned.
    """
    animation = rig.animation_data_create()
    if animation.action is not None or len(animation.nla_tracks):
        raise ValueError('Build ranger motion only on the fresh, unanimated rig')

    fps = scene.render.fps / scene.render.fps_base
    neutral = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    ground_height = _walk_grounding(rig, scene)
    clips = []
    try:
        for name, seconds, pose in (('Walk', 1.0, _walk), ('Idle', 4.0, _idle)):
            steps = max(2, round(seconds * fps))
            action = bpy.data.actions.new(name)
            action.use_fake_user = True
            action.frame_range = (1, steps + 1)
            action.use_cyclic = True
            animation.action = action
            curves = {}
            for sample in range(steps + 1):
                # Exactly identical endpoint, including phase-shifted channels.
                phase = math.tau * (sample % steps) / steps
                rotations, hips_location = pose(phase)
                if name == 'Walk':
                    hips_location = (0, ground_height(rotations), 0)
                channels = [(bone, 'rotation_euler', values)
                            for bone, values in rotations.items()]
                channels.append(('Hips', 'location', hips_location))
                for bone_name, property_name, values in channels:
                    bone = rig.pose.bones[bone_name]
                    if property_name == 'rotation_euler':
                        bone.rotation_mode = 'XYZ'
                    for axis, value in enumerate(values):
                        key = (bone_name, property_name, axis)
                        if key not in curves:
                            # Blender 5.2 creates/assigns the action slot, layer,
                            # keyframe strip and channelbag through this API.
                            curves[key] = action.fcurve_ensure_for_datablock(
                                rig, bone.path_from_id(property_name),
                                index=axis, group_name=bone_name)
                            curves[key].keyframe_points.add(steps + 1)
                        point = curves[key].keyframe_points[sample]
                        point.co = (sample + 1, value)
                        point.interpolation = 'LINEAR'
            for curve in curves.values():
                curve.update()

            track = animation.nla_tracks.new()
            track.name = name
            track.mute = True
            strip = track.strips.new(name, 1, action)
            strip.action_slot = animation.action_slot
            strip.action_frame_start = 1
            strip.action_frame_end = steps + 1
            strip.blend_type = 'REPLACE'
            strip.extrapolation = 'NOTHING'
            strip.influence = 1.0
            clips.append({
                'action': action.name,
                'duration_seconds': steps / fps,
                'track': track.name,
                'strip': strip.name,
                'frame_start': 1,
                'frame_end': steps + 1,
            })
    finally:
        animation.action = None
        for track in animation.nla_tracks:
            track.mute = True
        for bone in rig.pose.bones:
            bone.matrix_basis = neutral[bone.name]
    return clips
