"""A new reference-based character, built without the previous mesh or rig.

Coordinates: Blender metres, Z up, front -Y. The semantic bone names are a game
interface, not inherited transforms. Meshes deform through a newly authored skin.
"""
import math
import runpy
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
SCENE = 'Ranger - new character from reference'
scene = bpy.context.scene
if scene.name != SCENE:
    raise RuntimeError('Select the new, separate ranger scene')
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for obj in list(scene.objects):
    data=obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if isinstance(data,bpy.types.Mesh) and data.users==0:
        bpy.data.meshes.remove(data)
    elif isinstance(data,bpy.types.Armature) and data.users==0:
        bpy.data.armatures.remove(data)
for material in list(bpy.data.materials):
    if 'ranger_material' in material and material.users==0:
        bpy.data.materials.remove(material)
scene.unit_settings.system = 'METRIC'

BONES = {
    'Hips': ((0,0,.97), None),
    'Torso': ((0,0,1.10), 'Hips'),
    'Head': ((0,0,1.60), 'Torso'),
    'RightArm': ((-.215,0,1.455), 'Torso'),
    'RightForearm': ((-.305,-.012,1.165), 'RightArm'),
    'RightHand': ((-.370,-.030,.900), 'RightForearm'),
    'LeftArm': ((.215,0,1.455), 'Torso'),
    'LeftForearm': ((.305,-.012,1.165), 'LeftArm'),
    'LeftHand': ((.370,-.030,.900), 'LeftForearm'),
    'RightLeg': ((-.092,0,.935), 'Hips'),
    'RightShin': ((-.105,-.020,.515), 'RightLeg'),
    'RightFoot': ((-.11,-.010,.100), 'RightShin'),
    'LeftLeg': ((.092,0,.935), 'Hips'),
    'LeftShin': ((.105,-.020,.515), 'LeftLeg'),
    'LeftFoot': ((.11,-.010,.100), 'LeftShin'),
    'Cloak': ((0,.065,1.449), 'Torso'),
    'Helmet': ((0,0,1.60), 'Head'),
}
armature = bpy.data.armatures.new('Reference ranger skeleton')
rig = bpy.data.objects.new('RangerSkeleton', armature)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, (head, parent) in BONES.items():
    bone = armature.edit_bones.new(name)
    bone.head = head
    # Consistent anatomical rotation axes also export as game Y-up axes.
    bone.tail = (head[0],head[1],head[2]+.10)
    if parent:
        bone.parent = armature.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front = True
armature.display_type = 'STICK'


def srgb(hex_color):
    values = [int(hex_color[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)


PALETTE = {
    'Skin': ('b08b70',.68,0), 'SkinWarm': ('98775e',.72,0),
    'Lip': ('9a7464',.66,0), 'Eye': ('b7b3a2',.30,0),
    'Iris': ('646d56',.32,0), 'Pupil': ('20251e',.22,0),
    'Hair': ('786748',.63,0), 'HairLight': ('a9926c',.59,0), 'HairDark': ('4d4535',.78,0),
    'Leather': ('4b3d2f',.86,0), 'LeatherEdge': ('6a5841',.84,0),
    'Cloth': ('51483a',.95,0), 'Cloak': ('34412c',.96,0),
    'CloakEdge': ('586048',.96,0), 'Stitch': ('8e8064',.92,0),
    'Boot': ('473d30',.81,0), 'Sole': ('292821',.96,0),
    'Brass': ('8c7a54',.47,.7), 'Steel': ('afb2aa',.33,.8),
    'SteelDark': ('5e655e',.48,.7), 'Wood': ('514a39',.9,0),
}
for name,(color,roughness,metallic) in PALETTE.items():
    material=bpy.data.materials.new(name)
    material.diffuse_color=(*srgb(color),1)
    material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(1,1,1,1)
    shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Metallic'].default_value=metallic
    # Vertex colour is authored surface variation, not a runtime procedural aid.
    attribute=material.node_tree.nodes.new('ShaderNodeVertexColor')
    attribute.layer_name='Surface detail'
    material.node_tree.links.new(attribute.outputs['Color'],shader.inputs['Base Color'])
    material['ranger_material']=name

MATERIALS={m['ranger_material']:m for m in bpy.data.materials if 'ranger_material' in m}


class Part:
    def __init__(self,name,material,deform='Head'):
        self.name,self.material,self.deform=name,material,deform
        self.vertices=[]; self.faces=[]

    def vertex(self,p):
        self.vertices.append(tuple(p)); return len(self.vertices)-1

    def face(self,*indices):
        self.faces.append(tuple(indices))

    def loft(self,rows,sides=32):
        """Rows contain z, halfwidth, halfdepth, x-centre, y-centre."""
        start=len(self.vertices)
        for z,rx,ry,x,y in rows:
            for i in range(sides):
                a=math.tau*i/sides
                self.vertex((x+rx*math.cos(a),y+ry*math.sin(a),z))
        for row in range(len(rows)-1):
            for i in range(sides):
                a=start+row*sides+i; b=start+row*sides+(i+1)%sides
                self.face(a,b,b+sides,a+sides)
        self.faces.append(tuple(start+i for i in reversed(range(sides))))
        self.faces.append(tuple(start+(len(rows)-1)*sides+i for i in range(sides)))
        return self

    def ellipsoid(self,center,radii,sides=24,rings=12):
        x,y,z=center; rx,ry,rz=radii
        rows=[]
        for i in range(rings+1):
            a=-math.pi/2+math.pi*i/rings; c=max(.001,math.cos(a))
            rows.append((z+rz*math.sin(a),rx*c,ry*c,x,y))
        return self.loft(rows,sides)

    def tube(self,points,radii,sides=8):
        points=[Vector(p) for p in points]; start=len(self.vertices)
        for i,p in enumerate(points):
            tangent=(points[min(len(points)-1,i+1)]-points[max(0,i-1)]).normalized()
            reference=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
            normal=tangent.cross(reference).normalized(); bitangent=tangent.cross(normal)
            r=radii[i] if isinstance(radii,(list,tuple)) else radii
            for j in range(sides):
                a=j*math.tau/sides; self.vertex(p+r*(normal*math.cos(a)+bitangent*math.sin(a)))
        for i in range(len(points)-1):
            for j in range(sides):
                a=start+i*sides+j; b=start+i*sides+(j+1)%sides
                self.face(a,b,b+sides,a+sides)
        self.faces.append(tuple(start+i for i in reversed(range(sides))))
        self.faces.append(tuple(start+(len(points)-1)*sides+i for i in range(sides)))
        return self

    def data(self):
        return {'name':self.name,'vertices':self.vertices,'faces':self.faces,'material':self.material,'deform':self.deform}


def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a))); return t*t*(3-2*t)


def weights(deform,p):
    x,y,z=p
    if deform in BONES:
        return {deform:1.0}
    if deform.startswith('arm.'):
        side='Left' if deform.endswith('L') else 'Right'
        upper=smoothstep(1.12,1.21,z)
        hand=1-smoothstep(.875,.94,z)
        anchor=smoothstep(1.45,1.52,z)*(1-smoothstep(.15,.215,abs(x)))
        return {'Torso':anchor,side+'Arm':upper*(1-anchor),
                side+'Forearm':(1-upper)*(1-hand)*(1-anchor),side+'Hand':(1-upper)*hand*(1-anchor)}
    if deform.startswith('leg.'):
        side='Left' if deform.endswith('L') else 'Right'
        thigh=smoothstep(.465,.565,z)
        foot=1-smoothstep(.095,.17,z)
        return {side+'Leg':thigh,side+'Shin':(1-thigh)*(1-foot),side+'Foot':(1-thigh)*foot}
    if deform=='cape':
        shoulder=.55*smoothstep(.17,.27,abs(x))*smoothstep(1.38,1.50,z)
        return {'Cloak':1-shoulder,('LeftArm' if x>0 else 'RightArm'):shoulder}
    torso=smoothstep(1.01,1.20,z)
    return {'Hips':1-torso,'Torso':torso}


PARTS=[]

def make_mesh(data):
    mesh=bpy.data.meshes.new(data['name']+' topology')
    vertices=data['vertices']
    if data['deform']=='Head':
        vertices=[(x*.88,y*.95,1.60+(z-1.60)*.90) for x,y,z in vertices]
    mesh.from_pydata(vertices,[],data['faces'])
    if mesh.validate():
        raise RuntimeError('Invalid fresh mesh: '+data['name'])
    topology=bmesh.new(); topology.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(topology,faces=list(topology.faces))
    topology.to_mesh(mesh); topology.free(); mesh.update()
    uv=mesh.uv_layers.new(name='Material grain')
    for poly in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        for index in poly.loop_indices:
            p=mesh.vertices[mesh.loops[index].vertex_index].co
            a,b=(p.x,p.z) if axis==1 else (p.y,p.z) if axis==0 else (p.x,p.y)
            uv.data[index].uv=(a*6+.5,b*6+.5)
    mesh.materials.append(MATERIALS[data['material']])
    for poly in mesh.polygons: poly.use_smooth=True
    # Small material wear and natural skin variation remain visible without a
    # painted-on front view. All four inspection directions use actual geometry.
    colors=mesh.color_attributes.new(name='Surface detail',type='FLOAT_COLOR',domain='POINT')
    for vertex,color in zip(mesh.vertices,colors.data):
        x,y,z=vertex.co
        wave=.965+.022*math.sin(x*257+y*173+z*131)+.011*math.sin(x*97-z*223)
        if data['name']=='Anatomical face':
            beard=(1-smoothstep(1.64,1.674,z))*smoothstep(1.575,1.605,z)*(1-smoothstep(-.04,.005,y))
            wave*=1-.24*beard
        base=MATERIALS[data['material']].diffuse_color
        color.color=(base[0]*wave,base[1]*wave,base[2]*wave,1)
    obj=bpy.data.objects.new(data['name'],mesh); scene.collection.objects.link(obj)
    if data.get('parent'):
        obj.parent=scene.objects[data['parent']]
    else:
        obj.parent=rig
        groups={name:obj.vertex_groups.new(name=name) for name in BONES}
        for vertex in mesh.vertices:
            for bone,weight in weights(data['deform'],vertex.co).items():
                if weight>.00001: groups[bone].add([vertex.index],weight,'REPLACE')
        modifier=obj.modifiers.new('Reference ranger skin','ARMATURE'); modifier.object=rig
        modifier.use_deform_preserve_volume=True
    obj['ranger_deform']=data['deform']
    PARTS.append(obj)
    return obj


def new_head():
    parts=[]
    head=Part('Anatomical face','Skin')
    profile=[(1.580,.031,.029,-.020),(1.593,.050,.044,-.012),(1.615,.070,.061,-.005),
             (1.645,.082,.072,.003),(1.681,.091,.081,.006),(1.713,.092,.083,.008),
             (1.742,.091,.081,.010),(1.770,.084,.080,.012),(1.795,.068,.067,.014),
             (1.816,.041,.043,.014),(1.826,.003,.004,.014)]
    def sample(z):
        for a,b in zip(profile,profile[1:]):
            if z<=b[0]:
                t=(z-a[0])/(b[0]-a[0]); return [a[i]+t*(b[i]-a[i]) for i in range(1,4)]
        return list(profile[-1][1:])
    def face_depth(x,z):
        rx,ry,cy=sample(z)
        y=cy-ry*max(0,1-(x/rx)**2)**.32
        y-=.011*math.exp(-((abs(x)-.060)/.023)**2-((z-1.690)/.025)**2)
        y+=.015*math.exp(-((abs(x)-.037)/.024)**2-((z-1.719)/.013)**2)
        y-=.009*math.exp(-((abs(x)-.037)/.029)**2-((z-1.738)/.012)**2)
        y-=.014*math.exp(-(x/.009)**2-((z-1.728)/.024)**2)
        y-=.028*math.exp(-(x/.014)**2-((z-1.697)/.019)**2)
        y-=.017*math.exp(-((abs(x)-.014)/.008)**2-((z-1.689)/.009)**2)
        y-=.008*math.exp(-(x/.031)**2-((z-1.650)/.020)**2)
        y+=.007*math.exp(-((abs(x)-.057)/.017)**2-((z-1.650)/.020)**2)
        y-=.006*math.exp(-(x/.033)**2-((z-1.610)/.017)**2)
        return y
    sides=96; rows=65
    for j in range(rows):
        z=profile[0][0]+(profile[-1][0]-profile[0][0])*j/(rows-1)
        rx,ry,cy=sample(z)
        for i in range(sides):
            a=i*math.tau/sides; x=rx*math.cos(a); y=cy+ry*math.sin(a)
            if math.sin(a)<0:
                y=face_depth(x,z)
            head.vertex((x,y,z))
    for j in range(rows-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides; head.face(a,b,b+sides,a+sides)
    head.faces.append(tuple(reversed(range(sides))))
    head.faces.append(tuple((rows-1)*sides+i for i in range(sides)))
    for sign in [-1,1]:
        head.ellipsoid((sign*.012,-.095,1.689),(.007,.006,.004),20,10)
        # Ear helix, antihelix and concha, rather than a featureless side bead.
        head.ellipsoid((sign*.093,.007,1.702),(.013,.017,.029),24,16)
        head.tube([(sign*.098,.000,1.679),(sign*.105,-.003,1.696),(sign*.105,.003,1.718),
                   (sign*.099,.014,1.724),(sign*.095,.019,1.711)],.0036,8)
    parts.append(head)
    shadow=Part('Nostrils and ear recesses','SkinWarm')
    for sign in [-1,1]:
        shadow.ellipsoid((sign*.010,-.100,1.685),(.0022,.0012,.0010),16,8)
        shadow.ellipsoid((sign*.101,-.004,1.702),(.0028,.0037,.012),16,10)
    parts.append(shadow)
    whites=Part('Eye whites','Eye'); irises=Part('Green grey irises','Iris'); pupils=Part('Pupils','Pupil')
    lids=Part('Sculpted eyelids','Skin'); lashes=Part('Upper lash shadow','HairDark')
    for sign in [-1,1]:
        cx=sign*.037; cz=1.720
        eye_y=face_depth(cx,cz)-.004
        center=whites.vertex((cx,eye_y,cz)); ring=[]
        for i in range(32):
            a=i*math.tau/32; dx=.021*math.cos(a); z=cz+.0052*math.sin(a)
            ring.append(whites.vertex((cx+dx,face_depth(cx+dx,z)-.001,z)))
        for i in range(32): whites.face(center,ring[i],ring[(i+1)%32])
        irises.ellipsoid((cx,eye_y-.001,cz),(.0051,.0024,.0051),24,12)
        pupils.ellipsoid((cx,eye_y-.0033,cz),(.0021,.0008,.0027),16,8)
        upper=[]; lower=[]
        for i in range(17):
            a=i*math.pi/16
            x=cx+.021*math.cos(a); upper_z=cz+.0052*math.sin(a); lower_z=cz-.0052*math.sin(a)
            upper.append((x,face_depth(x,upper_z)-.001,upper_z))
            lower.append((x,face_depth(x,lower_z)-.001,lower_z))
        lids.tube(upper,.0022,8); lids.tube(lower,.0017,8)
        lashes.tube([(x,y-.0005,z-.0005) for x,y,z in upper],.0007,5)
    parts += [whites,irises,pupils,lids,lashes]
    lips=Part('Natural lip planes','Lip')
    lips.tube([(-.023,-.064,1.648),(-.012,-.072,1.652),(0,-.074,1.650),(.012,-.072,1.652),(.023,-.064,1.648)],
              [.001,.0018,.0017,.0018,.001],10)
    lips.tube([(-.022,-.065,1.646),(-.010,-.073,1.642),(0,-.074,1.641),(.010,-.073,1.642),(.022,-.065,1.646)],
              [.0008,.0018,.0021,.0018,.0008],10)
    lips.vertices=[(x,face_depth(x,z)-.002,z) for x,y,z in lips.vertices]
    parts.append(lips)
    brows=Part('Brows','HairDark')
    for sign in [-1,1]:
        points=[]
        for i in range(13):
            t=i/12; x=sign*(.018+.043*t); z=1.740+.003*math.sin(t*math.pi)-.003*t
            points.append((x,face_depth(x,z)-.002,z))
        brows.tube(points,[.0015+.0017*math.sin(math.pi*i/12) for i in range(13)],7)
    parts.append(brows)
    return [part.data() for part in parts]






for module in ['ranger_anatomy.py','ranger_garments.py','ranger_features.py']:
    for data in runpy.run_path(str(ROOT/'assets'/module))['build']():
        make_mesh(data)
for data in new_head():
    make_mesh(data)

equipment=runpy.run_path(str(ROOT/'assets/ranger_equipment.py'))
for name,(bone,position) in equipment['ANCHORS'].items():
    obj=bpy.data.objects.new(name,None)
    scene.collection.objects.link(obj)
    obj.parent=rig; obj.parent_type='BONE'; obj.parent_bone=bone
    bpy.context.view_layer.update()
    obj.matrix_world=Matrix.Translation(position)
for data in equipment['build'](Part):
    make_mesh(data)
scene.objects['Staff'].hide_render=True
for obj in scene.objects['Staff'].children:
    obj.hide_render=True
    obj.hide_set(True)
scene.objects['Staff'].hide_set(True)
scene.objects['Sword'].rotation_euler.rotate_axis('X',-.55)
scene.objects['Sword'].rotation_euler.rotate_axis('Y',-.20)
studio=runpy.run_path(str(ROOT/'assets/ranger_studio.py'))
studio['finish_materials'](MATERIALS)
clips=runpy.run_path(str(ROOT/'assets/ranger_animation.py'))['build'](rig,scene)
studio['create_studio'](scene)

bpy.context.view_layer.update()
result={'scene':scene.name,'new_rig':rig.name,'meshes':len(PARTS),
        'triangles':sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in PARTS)}
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/ranger.blend'))
