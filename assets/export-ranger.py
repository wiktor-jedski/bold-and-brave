"""Export ranger.blend in a background Blender process; keep author meshes intact."""
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
rig=scene.objects['RangerSkeleton']
if bpy.context.object and bpy.context.object.mode!='OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for obj in scene.objects:
    obj.select_set(False)
    if obj==rig or 'ranger_deform' in obj or obj.name in ['Sword','Staff','Shield']:
        obj.hide_render=False;obj.hide_set(False)
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:
    track.mute=True
bpy.context.view_layer.update()

groups={}
for obj in list(scene.objects):
    deform=obj.get('ranger_deform')
    if obj.type!='MESH' or not deform:
        continue
    role=obj.parent.name if deform=='rigid' else 'cape' if deform=='cape' else 'body'
    key=(role,obj.data.materials[0].name)
    groups.setdefault(key,[]).append(obj)
for (role,material),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:
        bpy.ops.object.join()
    joined=bpy.context.view_layer.objects.active
    joined.name='Ranger '+role+' '+material+' geometry'
    joined['ranger_deform']='cape' if role=='cape' else 'rigid' if role in ['Sword','Staff','Shield'] else 'body'
for material in bpy.data.materials:
    if material.get('ranger_material'):
        material.name=material['ranger_material']
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj==rig or 'ranger_deform' in obj or obj.name in ['Sword','Staff','Shield']:
        obj.select_set(True)
for track in rig.animation_data.nla_tracks:
    track.is_solo=False;track.mute=False
path=ROOT/'public/assets/frontier-human.glb'
bpy.ops.export_scene.gltf(
    filepath=str(path),export_format='GLB',use_selection=True,
    export_extras=True,export_animations=True,export_animation_mode='NLA_TRACKS',
    export_frame_range=False,export_force_sampling=True,export_frame_step=1,
    export_anim_slide_to_zero=True,export_rest_position_armature=True,
    export_vertex_color='ACTIVE',export_all_vertex_colors=False,
    export_current_frame=False)
result={'path':str(path),'bytes':path.stat().st_size,
        'mesh_groups':list(groups),'clips':[track.name for track in rig.animation_data.nla_tracks]}
