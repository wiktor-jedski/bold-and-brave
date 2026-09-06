"""New ranger equipment in local Blender Z-up coordinates, front -Y."""
import math


def build(Part):
    parts=[]
    def part(name,material,parent):
        item=Part(name,material,'rigid')
        parts.append((item,parent))
        return item
    blade=part('Forged tapered blade','Steel','Sword')
    blade.loft([(-.93,.0004,.0003,0,0),(-.77,.019,.0030,0,0),
                (-.20,.026,.0042,0,0),(-.048,.027,.0045,0,0)],4)
    fuller=part('Blade fuller','SteelDark','Sword')
    for sign in [-1,1]:
        fuller.tube([(0,sign*.0043,-.15),(0,sign*.0037,-.52),(0,sign*.0031,-.75)],
                    [.0035,.0028,.0004],4)
    hilt=part('Worn leather sword grip','Leather','Sword')
    hilt.loft([(-.055,.010,.009,0,0),(.070,.0088,.0083,0,0)],16)
    wrap=part('Fine grip wrapping','LeatherEdge','Sword')
    points=[]
    for i in range(321):
        t=i/320; a=t*math.tau*12
        points.append((.0101*math.cos(a),.0092*math.sin(a),-.050+.115*t))
    wrap.tube(points,.0009,5)
    guard=part('Curved guard and wheel pommel','Brass','Sword')
    guard.tube([(-.119,0,-.008),(-.106,0,-.027),(-.072,0,-.044),(0,0,-.050),
                (.072,0,-.044),(.106,0,-.027),(.119,0,-.008)],
               [.006,.008,.010,.011,.010,.008,.006],10)
    guard.loft([(-.060,.013,.012,0,0),(-.043,.013,.012,0,0)],16)
    guard.loft([(.060,.012,.011,0,0),(.077,.012,.011,0,0)],16)
    guard.ellipsoid((0,0,.095),(.021,.014,.021),24,14)
    seal=part('Pommel engraving','SteelDark','Sword')
    seal.tube([(.016*math.cos(i*math.tau/32),-.014,.095+.016*math.sin(i*math.tau/32)) for i in range(33)],.0008,5)
    seal.tube([(0,-.0145,.083),(0,-.0145,.106)],.001,5)
    for sign in [-1,1]:
        seal.tube([(0,-.0145,.093),(sign*.009,-.0145,.100),(sign*.007,-.0145,.105)],.0007,5)

    wood=part('Convex oak shield boards','Wood','Shield')
    radius=.305; sides=80; rows=11
    for j in range(rows):
        r=max(.0001,radius*j/(rows-1))
        for i in range(sides):
            a=i*math.tau/sides
            wood.vertex((r*math.cos(a),-.025-.018*(1-(r/radius)**2),r*math.sin(a)))
    for j in range(rows-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;wood.face(a,a+sides,b+sides,b)
    centre=wood.vertex((0,.005,0)); outer=[]
    for i in range(sides):
        a=i*math.tau/sides;outer.append(wood.vertex((radius*math.cos(a),.005,radius*math.sin(a))))
    for i in range(sides):
        wood.face(centre,outer[(i+1)%sides],outer[i])
        front=(rows-1)*sides+i;next_front=(rows-1)*sides+(i+1)%sides
        wood.face(front,next_front,outer[(i+1)%sides],outer[i])
    rim=part('Iron shield rim and boss','SteelDark','Shield')
    rim.tube([(radius*math.cos(i*math.tau/80),-.012,radius*math.sin(i*math.tau/80)) for i in range(81)],.014,10)
    rim.ellipsoid((0,-.047,0),(.070,.043,.070),32,18)
    fittings=part('Shield rivets and inlay border','Brass','Shield')
    for r in [.277,.292]:
        fittings.tube([(r*math.cos(i*math.tau/80),-.032,r*math.sin(i*math.tau/80)) for i in range(81)],.0015,5)
    fittings.tube([(.077*math.cos(i*math.tau/48),-.047,.077*math.sin(i*math.tau/48)) for i in range(49)],.004,8)
    for i in range(28):
        a=i*math.tau/28
        fittings.ellipsoid((.293*math.cos(a),-.032,.293*math.sin(a)),(.0037,.0025,.0037),10,6)
    emblem=part('Branching tree shield inlay','Stitch','Shield')
    def trace(points,width):
        lifted=[]
        for x,z in points:
            r=math.hypot(x,z)
            if r>.265:
                x*=.265/r;z*=.265/r;r=.265
            lifted.append((x,-.027-.018*(1-(r/radius)**2),z))
        emblem.tube(lifted,width,6)
    trace([(-.007,-.237),(-.014,-.150),(.009,-.067),(-.002,.015),(.012,.093),(.004,.180),(.025,.250)],.0023)
    for sign in [-1,1]:
        for n in range(4):
            z=-.100+n*.072; reach=.19-n*.018
            end_z=z+.073+.012*math.sin(n*2+sign)
            trace([(0,z),(sign*.05,z+.025),(sign*reach,end_z),(sign*(reach+.023),end_z+.060)],.0015)
            trace([(sign*.063,z+.031),(sign*.090,z+.095),(sign*.073,z+.148)],.001)
            trace([(sign*(reach*.73),end_z-.014),(sign*(reach+.035),end_z-.025),(sign*(reach+.060),end_z+.010)],.0009)
        trace([(0,-.172),(sign*.067,-.212),(sign*.144,-.239)],.0018)
        trace([(sign*.056,-.207),(sign*.062,-.250)],.0011)
    straps=part('Shield rear straps','Leather','Shield')
    for z in [-.140,.080]:
        depth=.045 if z<0 else .075
        straps.tube([(-.072,.005,z),(-.052,depth,z),(.052,depth,z),(.072,.005,z)],.010,10)

    shaft=part('Oak staff','Wood','Staff')
    shaft.loft([(-.80,.017,.017,0,0),(-.42,.018,.018,.002,0),
                (.40,.016,.016,-.002,0),(1.25,.017,.017,0,0)],16)
    ferrule=part('Staff ferrules','SteelDark','Staff')
    for z in [-.80,1.213]:
        ferrule.loft([(z,.019,.019,0,0),(z+.037,.019,.019,0,0)],16)
    binding=part('Staff grip binding','Leather','Staff')
    binding.loft([(-.09,.019,.019,0,0),(.105,.019,.019,0,0)],16)
    for item,parent in parts:
        if parent=='Shield':
            item.vertices=[tuple(value*1.10 for value in point) for point in item.vertices]
    return [dict(item.data(),parent=parent) for item,parent in parts]


ANCHORS = {
    'Sword': ('RightHand',(-.382,-.070,.835)),
    'Staff': ('RightHand',(-.382,-.070,.835)),
    'Shield': ('LeftForearm',(.395,-.120,.990)),
}
