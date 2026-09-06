"""Fresh reference-based ranger clothing, in metres and relaxed A-pose.

Only standard-library geometry; build() returns independent mesh descriptions.
Front is -Y. Fine details share meshes by material and deformation domain.
"""

from math import cos, sin, pi, sqrt, exp, asin


def _part(name, vertices, faces, material, deform):
    return dict(name=name, vertices=vertices, faces=faces,
                material=material, deform=deform)


def _grid(name, rows, columns, point, material, deform, wrap=False,
          thickness=0.0, omit=None):
    vertices = [point(i / rows, j / columns)
                for i in range(rows + 1)
                for j in range(columns if wrap else columns + 1)]
    stride = columns if wrap else columns + 1
    faces = []
    for i in range(rows):
        for j in range(columns):
            if omit and omit((i + .5) / rows, (j + .5) / columns):
                continue
            a = i * stride + j
            b = i * stride + (j + 1) % stride
            faces.append((a, b, b + stride, a + stride))
    if thickness:
        # Offset the reverse skin along the accumulated geometric normals.
        normals = [[0., 0., 0.] for _ in vertices]
        edges = {}
        for face in faces:
            a, b, c = [vertices[k] for k in face[:3]]
            u = [b[k] - a[k] for k in range(3)]
            v = [c[k] - a[k] for k in range(3)]
            n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2],
                 u[0]*v[1]-u[1]*v[0])
            for index in face:
                for k in range(3):
                    normals[index][k] += n[k]
            for a, b in zip(face, face[1:] + face[:1]):
                key = (min(a, b), max(a, b))
                edges[key] = None if key in edges else (a, b)
        count = len(vertices)
        vertices += [tuple(p[k] - thickness*n[k]/max(sqrt(sum(x*x for x in n)), 1e-12)
                           for k in range(3)) for p, n in zip(vertices, normals)]
        faces += [tuple(index + count for index in reversed(face)) for face in faces[:]]
        faces += [(b, a, a + count, b + count)
                  for edge in edges.values() if edge is not None for a, b in [edge]]
    return _part(name, vertices, faces, material, deform)


def _profile(keys, t):
    position = t * (len(keys) - 1)
    index = min(int(position), len(keys) - 2)
    fraction = position - index
    return tuple(a + (b-a)*fraction for a, b in zip(keys[index], keys[index+1]))


def _loft(name, keys, rows, columns, material, deform, wrinkle=0., cap=False):
    def point(t, u):
        x, y, z, rx, ry = _profile(keys, t)
        angle = 2*pi*u
        ripple = wrinkle*sin(t*34*pi + 2.2*sin(angle))*sin(pi*t)**2
        return (x + (rx+ripple)*sin(angle),
                y - (ry+ripple)*cos(angle), z)
    mesh = _grid(name, rows, columns, point, material, deform, wrap=True)
    if cap:
        mesh['faces'] += [tuple(reversed(range(columns))),
                          tuple(rows*columns+j for j in range(columns))]
    return mesh


def _cord(points, radius=.0014, sides=5):
    vertices, faces = [], []
    for i, p in enumerate(points):
        a, b = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        tangent = tuple(b[k]-a[k] for k in range(3))
        length = sqrt(sum(v*v for v in tangent))
        tangent = tuple(v/max(length, 1e-12) for v in tangent)
        guide = (0., 0., 1.) if abs(tangent[2]) < .9 else (0., 1., 0.)
        u = (tangent[1]*guide[2]-tangent[2]*guide[1],
             tangent[2]*guide[0]-tangent[0]*guide[2],
             tangent[0]*guide[1]-tangent[1]*guide[0])
        length = sqrt(sum(v*v for v in u))
        u = tuple(v/length for v in u)
        v = (tangent[1]*u[2]-tangent[2]*u[1],
             tangent[2]*u[0]-tangent[0]*u[2],
             tangent[0]*u[1]-tangent[1]*u[0])
        vertices.extend(tuple(p[k]+radius*(u[k]*cos(2*pi*j/sides)+v[k]*sin(2*pi*j/sides))
                              for k in range(3)) for j in range(sides))
        if i:
            for j in range(sides):
                a, b = (i-1)*sides+j, (i-1)*sides+(j+1)%sides
                faces.append((a, b, b+sides, a+sides))
    faces += [tuple(reversed(range(sides))),
              tuple((len(points)-1)*sides+j for j in range(sides))]
    return vertices, faces


def _collect(groups, material, deform, geometry):
    vertices, faces = groups.setdefault((material, deform), ([], []))
    offset = len(vertices)
    vertices.extend(geometry[0])
    faces.extend(tuple(i+offset for i in face) for face in geometry[1])


def _buckle(groups, center, width, height, deform, material='Brass'):
    x, y, z = center
    path = [(x-width/2, y, z-height/2), (x+width/2, y, z-height/2),
            (x+width/2, y, z+height/2), (x-width/2, y, z+height/2),
            (x-width/2, y, z-height/2)]
    _collect(groups, material, deform, _cord(path, .0025, 6))
    _collect(groups, material, deform,
             _cord([(x, y-.001, z), (x+width*.48, y-.002, z)], .0017, 5))


def build():
    parts, details = [], {}
    torso = [(0, 0, .955, .171, .113), (0, 0, 1.03, .160, .110),
             (0, 0, 1.12, .156, .100), (0, 0, 1.22, .178, .107),
             (0, 0, 1.32, .201, .118), (0, 0, 1.39, .204, .116),
             (0, 0, 1.445, .216, .104), (0, 0, 1.482, .227, .084),
             (0, .003, 1.517, .163, .076), (0, .006, 1.541, .067, .061)]

    def jerkin(t, u):
        x, y, z, rx, ry = _profile(torso, t)
        a = u*2*pi
        # Shallow broad quilting is part of the leather surface, not applied cords.
        seam = .0045*sin(6*a+z*32)**2*sin(6*a-z*32)**2*sin(pi*t)**2
        return (x+(rx+seam)*sin(a), y-(ry+seam)*cos(a), z)

    parts.append(_grid('Fitted leather jerkin', 64, 80, jerkin,
                       'Leather', 'body', wrap=True))
    # Two front laps and two back skirt panels: open crotch and side vents.
    for index, (start, end) in enumerate([(-1.39, -.04), (.015, 1.39),
                                         (1.72, 3.10), (3.18, 4.57)]):
        def lap(t, u, start=start, end=end, index=index):
            a = start+(end-start)*u
            hem = .805 + .018*sin(a*2+.6) + (.012 if index == 0 else 0)
            z = hem+(1.075-hem)*t
            rx = .208*(1-t)+.160*t
            ry = .133*(1-t)+.114*t
            ripple = .003*sin(5*a+.4)*(1-t)
            return ((rx+ripple)*sin(a), -(ry+ripple)*cos(a)-(.004 if index == 0 else 0), z)
        parts.append(_grid('Lapped skirt panel '+str(index+1), 8, 12, lap,
                           'Leather', 'body', thickness=.003))
        # Short interrupted saddle stitches, not a bright perimeter border.
        for j in range(12):
            u = (j+.2)/12
            path = [lap(.055, u), lap(.055, min(u+.035, 1))]
            path = [(x, y-.002 if cos(start+(end-start)*u)>0 else y+.002, z) for x,y,z in path]
            _collect(details, 'Stitch', 'body', _cord(path, .0007, 4))

    def baldric(t, u):
        z = 1.085+.382*t
        x = .139-.294*t + (u-.5)*.042
        lower, upper = next((a, b) for a, b in zip(torso, torso[1:])
                            if a[2] <= z <= b[2])
        _, _, _, rx, ry = _profile([lower, upper], (z-lower[2])/(upper[2]-lower[2]))
        y = -ry*sqrt(max(.12, 1-(x/rx)**2))-.012
        return x, y, z+(u-.5)*.027
    parts.append(_grid('Diagonal chest baldric', 26, 3, baldric,
                       'LeatherEdge', 'body', thickness=.004))
    _buckle(details, baldric(.53, .5), .034, .037, 'body', 'Steel')

    belt = [(0, 0, 1.035, .165, .120), (0, 0, 1.080, .162, .115)]
    parts.append(_loft('Waist belt', belt, 3, 64, 'LeatherEdge', 'body'))
    _buckle(details, (-.006, -.126, 1.057), .052, .040, 'body', 'Steel')
    for x in [-.104, -.079, .059, .084, .107]:
        y = -.124*sqrt(1-(x/.17)**2)-.002
        _collect(details, 'Brass', 'body',
                 _cord([(x-.001, y, 1.057), (x+.001, y, 1.057)], .002, 6))
    for side in [-1, 1]:
        x, y = side*.135, -.080
        keys = [(x, y, .914, .027, .022), (x, y-.004, .925, .036, .029),
                (x, y-.004, .991, .039, .031), (x, y, 1.028, .031, .022)]
        parts.append(_loft('Belt pouch '+str(side), keys, 9, 20,
                           'Leather', 'body', cap=True))
        def flap(t, u, x=x, y=y):
            return x+(u-.5)*.070, y-.030-.005*sin(pi*t), 1.037-.061*t+.007*(2*u-1)**2*t
        parts.append(_grid('Pouch flap '+str(side), 6, 8, flap,
                           'LeatherEdge', 'body', thickness=.002))
        _buckle(details, (x, y-.039, .987), .015, .021, 'body')

    for side, label in [(1, 'L'), (-1, 'R')]:
        arm = 'arm.'+label
        # Radius sections follow wrist, forearm, elbow, upper arm, deltoid.
        armkeys = [(side*.370, -.030, .902, .031, .030),
                   (side*.352, -.025, .975, .047, .047),
                   (side*.330, -.019, 1.060, .058, .059),
                   (side*.305, -.012, 1.165, .047, .052),
                   (side*.280, -.003, 1.250, .061, .065),
                   (side*.250, .002, 1.350, .069, .071),
                   (side*.232, .001, 1.408, .075, .076),
                   (side*.215, 0, 1.455, .074, .073),
                   (side*.201, 0, 1.486, .053, .054),
                   (side*.187, 0, 1.511, .023, .035),
                   (side*.128, 0, 1.524, .008, .018)]
        def sleeve(t, u):
            x, y, z, rx, ry = _profile(armkeys, t)
            a = 2*pi*u
            quilt = .0024*sin(a*5+t*15*pi)**2*sin(a*5-t*15*pi)**2
            fold = sum(height*exp(-((z-level-.012*sin(a+phase))/width)**2)
                       for level, width, height, phase in
                       [(1.125, .016, .005, .3), (1.171, .019, .009, 1.4),
                        (1.211, .014, .006, 2.1), (.937, .013, .003, .8)])
            return (x+(rx+quilt+fold)*sin(a)*.953,
                    y-(ry+quilt+fold)*cos(a), z+(rx+quilt+fold)*sin(a)*side*.303)
        sleeve_mesh = _grid('Continuous quilted sleeve '+label, 56, 36, sleeve,
                            'Cloth', arm, wrap=True)
        sleeve_mesh['faces'].append(tuple(56*36+j for j in range(36)))
        parts.append(sleeve_mesh)
        # Overlapping upper-arm lames follow the cloth shoulder, including its crown.
        # Each full circumference closes above the deltoid; the small top ring
        # penetrates the covered torso instead of ending in an exposed shoulder hole.
        for index, (low, high) in enumerate([(.68, .84), (.79, .93), (.89, 1.)]):
            def shoulder(t, u, low=low, high=high):
                v = low+(high-low)*t
                x, y, z = sleeve(v, u)
                a = 2*pi*u
                relief = .0035+.003*sin(pi*t)
                return x+relief*sin(a)*.953, y-relief*cos(a), z+relief*sin(a)*side*.303
            panel = _grid('Overlapping shoulder leather '+label+' '+str(index),
                          9, 36, shoulder, 'Leather', arm, wrap=True, thickness=.002)
            parts.append(panel)
        def bracer(t, u):
            v = .045+.26*t
            x, y, z = sleeve(v, .06+.88*u)
            a = 2*pi*(.06+.88*u)
            return x+.004*sin(a)*.953, y-.004*cos(a), z+.004*sin(a)*side*.303
        parts.append(_grid('Formed forearm bracer '+label, 12, 24, bracer,
                           'Leather', arm, thickness=.003))
        for t in [.18, .78]:
            def strap(v, u, t=t):
                x, y, z = bracer(t+(v-.5)*.070, u)
                a = 2*pi*(.06+.88*u)
                return x+.002*sin(a), y-.002*cos(a), z
            parts.append(_grid('Bracer strap '+label+' '+str(t), 2, 24,
                               strap, 'LeatherEdge', arm))
        for j in range(9):
            p = bracer(.08+j*.095, .025)
            q = bracer(.12+j*.095, .09)
            _collect(details, 'Stitch', arm, _cord([p, q], .00085, 4))

        leg = 'leg.'+label
        trousers = [(side*.110, -.010, .115, .043, .045),
                    (side*.110, .002, .260, .064, .083),
                    (side*.109, .020, .344, .074, .080),
                    (side*.108, .014, .411, .067, .068),
                    (side*.105, -.020, .515, .060, .062),
                    (side*.103, -.010, .610, .073, .075),
                    (side*.099, .005, .745, .087, .094),
                    (side*.093, .008, .865, .092, .102),
                    (side*.090, .002, .968, .079, .096),
                    (side*.085, .001, 1.012, .066, .070)]
        def trouser(t, u):
            x, y, z, rx, ry = _profile(trousers, t)
            a = 2*pi*u
            fold = sum(height*exp(-((z-level-.015*sin(a+phase))/width)**2)
                       for level, width, height, phase in
                       [(.463, .018, .007, .4), (.506, .021, .006, 2.2),
                        (.556, .017, .009, 1.0), (.612, .026, .005, 2.8),
                        (.434, .014, .005, -.5)])
            quilt = .0017*sin(a*4+z*34)**2*sin(a*4-z*34)**2
            return x+(rx+fold+quilt)*sin(a), y-(ry+fold+quilt)*cos(a), z
        parts.append(_grid('Tailored folded trousers '+label, 64, 36, trouser,
                           'Cloth', leg, wrap=True))
        for index, (low, high) in enumerate([(.476, .536), (.525, .594)]):
            def knee(t, u, low=low, high=high):
                z = low+(high-low)*t+.007*sin(pi*u)
                station = next(i for i in range(len(trousers)-1)
                               if trousers[i][2] <= z <= trousers[i+1][2])
                v = (station+(z-trousers[station][2])/
                     (trousers[station+1][2]-trousers[station][2]))/(len(trousers)-1)
                a = -.91+1.82*u
                x, y, zz = trouser(v, a/(2*pi))
                relief = .003+.002*sin(pi*t)
                return x+relief*sin(a), y-relief*cos(a), zz
            parts.append(_grid('Lapped knee reinforcement '+label+' '+str(index),
                               8, 16, knee, 'Leather', leg, thickness=.002))
        bootkeys = [(side*.110, -.056, .024, .060, .130),
                    (side*.110, -.063, .040, .061, .141),
                    (side*.110, -.063, .067, .060, .137),
                    (side*.110, -.051, .089, .055, .111),
                    (side*.110, -.020, .126, .047, .072),
                    (side*.110, -.005, .172, .059, .072),
                    (side*.110, .007, .232, .071, .095),
                    (side*.109, .014, .304, .078, .096),
                    (side*.109, .017, .354, .083, .099),
                    (side*.108, .012, .431, .079, .087)]
        def boot(t, u):
            x, y, z, rx, ry = _profile(bootkeys, t)
            a = 2*pi*u
            exponent = .76+.24*min(1, t*3)
            sx, cy = sin(a), cos(a)
            ripple = sum(height*exp(-((z-level-.008*sin(a+phase))/width)**2)
                         for level, width, height, phase in
                         [(.145, .012, .004, .2), (.183, .016, .007, 1.4),
                          (.219, .014, .005, 2.1), (.284, .022, .003, -.4)])
            bx = x+(rx+ripple)*(1 if sx>=0 else -1)*abs(sx)**exponent
            by = y-(ry+ripple)*(1 if cy>=0 else -1)*abs(cy)**exponent
            rise = .024*exp(-((by+.020)/.037)**2)*max(0., 1-t/.24)
            return bx, by, z+rise
        parts.append(_grid('Continuous creased leather boot '+label, 48, 36, boot,
                           'Boot', leg, wrap=True))
        # Longitudinal sole skins keep the underside arch curved: a single
        # bottom n-gon would flatten it and conceal the separate stacked heel.
        def sole(t, u):
            y = -.205+.287*t
            width = .064*max(.015, 1-abs((y+.063)/.146)**(2/.76))**(.76/2)
            arch = .021*exp(-((y+.020)/.037)**2)
            return side*.110+(2*u-1)*width, y, .027+arch
        sole_mesh = _grid('Arched welt sole '+label, 28, 8, sole,
                          'Sole', leg, thickness=.014)
        parts.append(sole_mesh)
        heelkeys = [(side*.110, .043, .004, .043, .037),
                    (side*.110, .043, .010, .046, .039),
                    (side*.110, .043, .030, .047, .039)]
        parts.append(_loft('Separate stacked heel '+label, heelkeys, 2, 24,
                           'Sole', leg, cap=True))
        # The turned top follows the boot itself, so calf clearance survives
        # without oversized concentric cuffs or floating ankle rings.
        def cuff(t, u):
            x, y, z = boot(.977+.023*t, u)
            a = 2*pi*u
            return x+.002*sin(a), y-.002*cos(a), z
        parts.append(_grid('Narrow turned boot edge '+label, 3, 36, cuff,
                           'LeatherEdge', leg, wrap=True, thickness=.002))
        def ankle_strap(t, u):
            z = .119+.012*t
            v = (3+(z-.089)/(.126-.089))/9
            x, y, zz = boot(v, u)
            a = 2*pi*u
            return x+.002*sin(a), y-.002*cos(a), zz
        parts.append(_grid('Fitted ankle strap '+label, 2, 36, ankle_strap,
                           'LeatherEdge', leg, wrap=True))
        _buckle(details, (side*.137, -.082, .127), .015, .016, leg)
        for j in range(6):
            z = .115+j*.013
            y = -.101+j*.005
            _collect(details, 'LeatherEdge', leg,
                     _cord([(side*.110-.017, y, z), (side*.110+.017, y-.002, z+.010)], .0014, 5))

    def mantle(t, u):
        # Hem-to-neck ordering gives the cloth's visible upper skin outward normals.
        v = 1-t
        a = -.10+(2*pi+.18)*u
        rx = .072+.220*v
        ry = .067+.100*v
        fold = sum(height*exp(-((v-centre-.045*sin(a+phase))/width)**2)
                   for centre, width, height, phase in
                   [(.19, .10, .020, .4), (.43, .13, .025, 1.7),
                    (.72, .12, .017, 2.3)])
        hem = 1.385+.090*abs(sin(a))**1.5+.030*max(0,-cos(a))
        z = 1.585*(1-v)+hem*v+.004*sin(3*a+.8)*sin(pi*v)+fold*.45
        z += .045*sin(a)**2*sin(pi*v)
        return ((rx+fold)*sin(a), -(ry+fold)*cos(a)+.012*v, z)
    parts.append(_grid('Soft overlapping shoulder wrap', 24, 64, mantle,
                       'Cloak', 'cape', thickness=.0025))

    def overlap(t, u):
        # A folded diagonal end crosses the front of the wrap on the left.
        z = 1.385+.132*t
        x = .014+.064*t+(u-.5)*(.076-.030*t)
        y = -.166+.072*t-.006*sin(pi*u)-.004*sin(2*pi*t+.7)*sin(pi*t)
        return x, y, z+.014*(u-.5)
    parts.append(_grid('Asymmetric folded front overlap', 16, 12, overlap,
                       'Cloak', 'cape', thickness=.0025))

    def cloak(t, u):
        v = 1-t
        a = 1.23+(2*pi-2.46)*u
        rx = .252+.021*v
        ry = .130+.057*v
        # Unequally spaced folds drift, widen and gather into the shoulder.
        # No common sinusoidal frequency reaches the hem.
        fold = -.006
        for centre, width, height, drift in [
                (1.40, .13, .018, .12), (1.92, .18, .026, -.16),
                (2.43, .12, .019, .09), (2.87, .20, .030, -.08),
                (3.47, .15, .021, .19), (4.01, .22, .028, -.12),
                (4.65, .14, .017, .07)]:
            offset = a-centre-drift*v-.035*sin(4*v+centre)*v
            fold += height*(.40+.60*v)*exp(-(offset/(width+.035*v))**2)
        hem = .345+.028*sin(1.7*a+.4)+.017*sin(4.8*a+1.3)+.010*sin(11.3*a)
        hem += .025*exp(-((a-2.12)/.05)**2)+.014*exp(-((a-4.32)/.08)**2)
        ztop = 1.455+.006*cos(2*a)
        return ((rx+fold)*sin(a)+.011*v*v,
                -(ry+fold)*cos(a)+.026+.064*v,
                hem+(ztop-hem)*t)
    parts.append(_grid('Irregular softly gathered rear cloak', 40, 84, cloak,
                       'Cloak', 'cape', thickness=.0025))
    def embroidery(points, width):
        path=[]
        for start,end in zip(points,points[1:]):
            for step in range(8):
                f=step/8
                x=start[0]*(1-f)+end[0]*f
                z=start[1]*(1-f)+end[1]*f
                u=(pi+asin(-x/.28)-1.23)/(2*pi-2.46)
                t=(z-.36)/1.095
                for iteration in range(5):
                    px,py,pz=cloak(t,u)
                    u+=(px-x)/1.04
                    t+=(z-pz)/1.095
                px,py,pz=cloak(t,u)
                path.append((px,py+.0015,pz))
        _collect(details,'Stitch','cape',_cord(path,width,5))
    embroidery([(0,.77),(-.008,.90),(.008,1.04),(-.003,1.15),(.010,1.27)],.0018)
    for side in [-1,1]:
        for n in range(4):
            z=.91+n*.067
            reach=.145-n*.017
            embroidery([(0,z),(side*.042,z+.022),(side*reach,z+.055),
                        (side*(reach+.012),z+.102)],.0011)
            embroidery([(side*.04,z+.022),(side*.067,z+.082),
                        (side*.055,z+.126)],.0007)
        embroidery([(0,.85),(side*.044,.80),(side*.112,.78)],.0012)

    # The lowered hood lies against the back, folded flat rather than a basin.
    def hood(t, u):
        a = 1.72+(2*pi-3.44)*u
        v = 1-t
        fold = .006*exp(-((v-.33-.05*sin(a*2))/.13)**2)
        fold += .008*exp(-((v-.72+.04*cos(a*3))/.12)**2)
        return ((.071+.072*v)*sin(a),
                -(.073+.044*v+fold)*cos(a)+.012+.018*v,
                1.551-.095*v+.006*sin(a*2)*v)
    parts.append(_grid('Collapsed cloth hood folds', 20, 36, hood,
                       'Cloak', 'cape', thickness=.0025))
    # The tree clasp follows the outer mantle surface.
    cx, cy, cz = mantle(.42,.019)
    clasp = [(cx+.021*sin(2*pi*j/24), cy-.004,
              cz+.021*cos(2*pi*j/24)) for j in range(25)]
    _collect(details, 'Brass', 'cape', _cord(clasp, .0018, 6))
    disc=[(cx,cy-.005,cz)]+[(cx+.020*sin(2*pi*j/32),cy-.005,cz+.020*cos(2*pi*j/32)) for j in range(32)]
    _collect(details,'SteelDark','cape',(disc,[(0,j+1,(j+1)%32+1) for j in range(32)]))
    _collect(details,'Brass','cape',_cord([(cx,cy-.007,cz-.015),(cx,cy-.007,cz+.016)],.0009,5))
    for sign in [-1,1]:
        for level in [-.006,.001,.008]:
            _collect(details,'Brass','cape',_cord([(cx,cy-.007,cz+level),
                     (cx+sign*.011,cy-.007,cz+level+.003),
                     (cx+sign*.012,cy-.007,cz+level+.008)],.0007,5))
    for (material, deform), (vertices, faces) in details.items():
        parts.append(_part('Grouped '+material+' details '+deform,
                           vertices, faces, material, deform))
    return parts
