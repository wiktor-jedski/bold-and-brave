"""Authored surface maps and repeatable, honest model inspection cameras."""
import math
import bpy
import numpy as np
from mathutils import Vector


def finish_materials(materials):
    size=512
    y,x=np.mgrid[0:size,0:size].astype(np.float32)
    rng=np.random.default_rng(68021)
    maps={}; albedos={}
    for kind in ['Leather','Fabric','Wood']:
        fine=rng.random((size,size),dtype=np.float32)-.5
        mottling=np.zeros_like(x)
        for frequency in [2,4,8,16,32,64]:
            for harmonic in range(4):
                angle=rng.uniform(0,math.tau)
                k=round(frequency*math.cos(angle));l=round(frequency*math.sin(angle))
                mottling+=np.sin(math.tau*(k*x+l*y)/size+rng.uniform(0,math.tau))/frequency**.55
        mottling/=max(.001,float(mottling.std()))
        if kind=='Leather':
            height=.18*fine+.07*np.sin(x*.48+2*np.sin(y*.23))+.045*np.sin(y*.13+x*.19)
        elif kind=='Fabric':
            height=.08*fine+.11*np.sin(x*math.pi/2)*np.sin(y*math.pi/2)
        else:
            height=.07*fine+.16*np.sin(x*.24+1.8*np.sin(y*.019))
        dy,dx=np.gradient(height)
        normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=2)
        normal/=np.linalg.norm(normal,axis=2)[:,:,None]
        rgba=np.ones((size,size,4),dtype=np.float32)
        rgba[:,:,:3]=normal*.5+.5
        image=bpy.data.images.new('Ranger '+kind+' normal',width=size,height=size,alpha=True)
        image.colorspace_settings.name='Non-Color'
        image.pixels.foreach_set(rgba.ravel()); image.pack()
        maps[kind]=image
        value=np.clip(.62+.055*mottling+.16*fine,.31,.89)
        if kind=='Wood':
            value*=.68+.18*np.sin(x*.24+1.8*np.sin(y*.019))**2
        if kind=='Fabric':
            value=np.clip(.68+.025*mottling+.08*fine,.48,.89)
        rgba[:,:,:3]=value[:,:,None]
        albedo=bpy.data.images.new('Ranger '+kind+' wear',width=size,height=size,alpha=True)
        albedo.pixels.foreach_set(rgba.ravel());albedo.pack()
        albedos[kind]=albedo
    for name,material in materials.items():
        family='Fabric' if name in ['Cloth','Cloak','CloakEdge'] else 'Leather' if name in ['Leather','LeatherEdge','Boot'] else 'Wood' if name=='Wood' else None
        if not family:
            continue
        nodes=material.node_tree.nodes; links=material.node_tree.links
        image=nodes.new('ShaderNodeTexImage'); image.image=maps[family]
        albedo=nodes.new('ShaderNodeTexImage');albedo.image=albedos[family]
        multiply=nodes.new('ShaderNodeMixRGB')
        multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        attribute=next(node for node in nodes if node.bl_idname=='ShaderNodeVertexColor')
        links.new(albedo.outputs['Color'],multiply.inputs[1])
        links.new(attribute.outputs['Color'],multiply.inputs[2])
        links.new(multiply.outputs[0],nodes['Principled BSDF'].inputs['Base Color'])
        normal=nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.42
        links.new(image.outputs['Color'],normal.inputs['Color'])
        links.new(normal.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])


def create_studio(scene):
    world=bpy.data.worlds.new('Ranger neutral studio world')
    scene.world=world; world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.23,.25,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    collection=bpy.data.collections.new('Inspection studio');scene.collection.children.link(collection)
    def point(obj,target):
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    for name,position,power,color,size in [
        ('Key',(-3,-4,5),1000,(1,.88,.76),4),
        ('Fill',(4,-2,3),650,(.80,.87,1),3.5),
        ('Rim',(-2,3,4),950,(1,.94,.83),3),
        ('Underside',(0,-2,-3),600,(.9,.93,1),3),
    ]:
        data=bpy.data.lights.new('Inspection '+name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new('Inspection '+name,data);collection.objects.link(obj);obj.location=position;point(obj,(0,0,1))
    cameras={
        'Front':((0,-6,1.0),(0,0,1.0),2.05),
        'Left':((6,0,1.0),(0,0,1.0),2.05),
        'Top':((0,0,6),(0,0,1.0),1.18),
        'Bottom':((0,0,-6),(0,0,1.0),1.18),
        'Reference':((2.7,-5.5,2.5),(0,0,.96),2.20),
        'Face':((.30,-2,1.79),(0,-.015,1.705),.40),
    }
    for name,(position,target,scale) in cameras.items():
        data=bpy.data.cameras.new('Inspection '+name);data.type='ORTHO';data.ortho_scale=scale
        obj=bpy.data.objects.new('Inspection '+name,data);collection.objects.link(obj);obj.location=position;point(obj,target)
    mesh=bpy.data.meshes.new('Inspection ground mesh')
    mesh.from_pydata([(-20,-20,0),(20,-20,0),(20,20,0),(-20,20,0)],[],[(0,1,2,3)])
    ground=bpy.data.objects.new('Inspection ground',mesh);collection.objects.link(ground)
    material=bpy.data.materials.new('Inspection matte stone');material.diffuse_color=(.14,.135,.12,1);material.use_nodes=True
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=material.diffuse_color
    material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.93;mesh.materials.append(material)
    scene.camera=scene.objects['Inspection Front']
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1200;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=-1.0
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.overlay.show_overlays=False
                space.shading.type='SOLID';space.shading.color_type='MATERIAL'
                space.region_3d.view_perspective='CAMERA'
    return cameras
