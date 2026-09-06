"""Independent closed hair volumes and relaxed vertical-hilt grips.

Hair uses the unscaled head coordinates; apply the author's head transform once.
Hands are already in body coordinates. No Blender dependency or scene mutations.
"""
import math


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _mul(a, s):
    return tuple(x * s for x in a)


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _unit(a):
    return _mul(a, 1 / math.sqrt(sum(x*x for x in a)))


class _Part:
    def __init__(self, name, material, deform='Head'):
        self.data = dict(name=name, vertices=[], faces=[], material=material, deform=deform)

    def vertex(self, p):
        self.data['vertices'].append(tuple(p))
        return len(self.data['vertices']) - 1

    def face(self, *indices):
        self.data['faces'].append(indices)

    def sweep(self, points, widths, depths=None, sides=10, hair=False):
        """Closed flattened locks or rounded digits, with nondegenerate end poles."""
        depths = widths if depths is None else depths
        rings = []
        for i in range(1, len(points)-1):
            p = points[i]
            tangent = _unit(_sub(points[i+1], points[i-1]))
            reference = _sub(p, (0, .014, 1.735)) if hair else (0, 0, 1)
            across = _unit(_cross(reference, tangent))
            normal = _cross(tangent, across)
            ring = []
            for j in range(sides):
                angle = math.tau*j/sides
                ring.append(self.vertex(_add(p, _add(_mul(across, widths[i]*math.cos(angle)),
                                                     _mul(normal, depths[i]*math.sin(angle))))))
            rings.append(ring)
        start, end = self.vertex(points[0]), self.vertex(points[-1])
        for j in range(sides):
            k = (j+1) % sides
            self.face(start, rings[0][k], rings[0][j])
            for a, b in zip(rings, rings[1:]):
                self.face(a[j], a[k], b[k], b[j])
            self.face(rings[-1][j], rings[-1][k], end)

    def ellipsoid(self, center, radii, sides=20, rows=12):
        rings = []
        for row in range(1, rows):
            phi = math.pi*row/rows
            rings.append([self.vertex((center[0]+radii[0]*math.sin(phi)*math.cos(math.tau*j/sides),
                                       center[1]+radii[1]*math.sin(phi)*math.sin(math.tau*j/sides),
                                       center[2]+radii[2]*math.cos(phi))) for j in range(sides)])
        top = self.vertex((center[0], center[1], center[2]+radii[2]))
        bottom = self.vertex((center[0], center[1], center[2]-radii[2]))
        for j in range(sides):
            k = (j+1) % sides
            self.face(top, rings[0][j], rings[0][k])
            for a, b in zip(rings, rings[1:]):
                self.face(a[j], b[j], b[k], a[k])
            self.face(rings[-1][k], rings[-1][j], bottom)


def _surface(angle, theta, lift=0):
    # Broad low-amplitude waves, not cylindrical ropes. Vanish at the crown.
    wave = math.sin(theta)**.8 * (.0025*math.sin(7*angle+4*theta)
                                  + .0018*math.sin(11*angle-6*theta))
    radius = wave + lift
    return ((.099+radius)*math.sin(theta)*math.cos(angle),
            .014+(.098+radius)*math.sin(theta)*math.sin(angle),
            1.738+(.106+radius)*math.cos(theta))


def _hem(angle):
    front = max(0, -math.sin(angle))
    t = max(0, min(1, (front-.15)/.65))
    return 1.666 + .102*t*t*(3-2*t)


def _bezier(controls, count=25):
    points = []
    for i in range(count):
        t = i/(count-1)
        points.append(tuple((1-t)**3*controls[0][k] + 3*(1-t)**2*t*controls[1][k]
                            + 3*(1-t)*t*t*controls[2][k] + t**3*controls[3][k]
                            for k in range(3)))
    return points


def _lock(part, points, width):
    widths = []
    for i in range(len(points)):
        t = i/(len(points)-1)
        widths.append(width*math.sin(math.pi*t)**.65*(1-.50*t))
    part.sweep(points, widths, [w*.40 for w in widths], hair=True)


def _hair():
    scalp = _Part('Closed wavy hair foundation', 'Hair')
    locks = _Part('Side parted blond waves', 'Hair')
    lights = _Part('Fine sunlit hair ridges', 'HairLight')
    recess = _Part('Recessed side part', 'HairDark')
    sides, rows = 80, 24
    rings = []
    for row in range(1, rows+1):
        ring = []
        for j in range(sides):
            angle = math.tau*j/sides
            limit = math.acos((_hem(angle)-1.738)/.106)
            ring.append(scalp.vertex(_surface(angle, limit*row/rows)))
        rings.append(ring)
    crown = scalp.vertex((0, .014, 1.844))
    # An internal underside closes the irregular hem without an exposed top hole.
    inner = scalp.vertex((0, .020, 1.750))
    for j in range(sides):
        k = (j+1) % sides
        scalp.face(crown, rings[0][j], rings[0][k])
        for a, b in zip(rings, rings[1:]):
            scalp.face(a[j], b[j], b[k], a[k])
        scalp.face(rings[-1][k], rings[-1][j], inner)

    # Layered locks have unequal roots, sweep, length and width. The underlying
    # volume remains visible between fine ridges; strands never form a rope ring.
    for layer, count in enumerate((19, 13)):
        for n in range(count):
            angle = math.tau*(n+.37*layer)/count
            start = .26 + .42*layer + .10*math.sin(n*2.39)
            end = math.acos((_hem(angle)-1.738)/.106)
            end -= .06*layer + .035*math.sin(n*1.71)
            points = []
            for i in range(23):
                t = i/22
                a = angle + (.23*math.sin(t*10.5+n*1.8)+.12*(1-t))*math.sin(math.pi*t)
                theta = start+(end-start)*t
                points.append(_surface(a, theta, .003+.003*math.sin(math.pi*t)))
            _lock(lights if n % 9 == 2 else locks, points, .0115+.003*(1+math.sin(n*2.1))/2)

    # Fan out from an off-centre part, rather than duplicating one forelock.
    # Side-swept tips fall below the hairline but remain above the eyes.
    for n in range(7):
        f = n/6
        controls = ((.025+.008*f, .048-.101*f, 1.827-.026*f),
                    (-.003, .040-.139*f, 1.866-.025*f),
                    (-.086-.012*math.sin(f*math.pi), .033-.135*f, 1.829-.040*f),
                    (-.093+.037*f, .021-.111*f, 1.713+.035*f))
        points = _bezier(controls)
        _lock(lights if n == 2 else locks, points, .014-.003*f)
    for n in range(5):
        f = n/4
        points = _bezier(((.027, .052-.104*f, 1.827-.026*f),
                          (.066, .045-.124*f, 1.843-.029*f),
                          (.106, .021-.087*f, 1.773+.015*f),
                          (.101-.021*f, .030-.079*f, 1.681+.082*f)))
        _lock(lights if n == 3 else locks, points, .0115)
    points = _bezier(((.025, .052, 1.833), (.028, .021, 1.845),
                      (.032, -.035, 1.832), (.032, -.057, 1.807)))
    _lock(recess, points, .0013)
    return [part.data for part in (scalp, locks, lights, recess)]


def _hands():
    parts = []
    for side, sign in (('Left', 1), ('Right', -1)):
        hand = _Part(side+' rounded gripping hand', 'Skin', side+'Hand')
        # Build at +X and reflect the entire mesh, including winding, at the end.
        hand.ellipsoid((.379, -.032, .890), (.019, .018, .022))
        hand.ellipsoid((.405, -.044, .853), (.020, .024, .040))
        hand.ellipsoid((.391, -.035, .870), (.020, .019, .024))
        # Four fingers stack down the vertical grip. Their inner surface leaves
        # a roughly 11 mm radius channel around x=.382, y=-.070.
        for index, z in enumerate((.875, .857, .839, .822)):
            radius = (.009, .0091, .0085, .0075)[index]
            points = []
            widths = []
            count = 29
            for j in range(count):
                t = j/(count-1)
                angle = .24 - 4.15*t
                points.append((.382+.030*math.cos(angle), -.070+.025*math.sin(angle),
                               z-.004*math.sin(math.pi*t)))
                # Rounded end caps and slight interphalangeal constrictions.
                cap = min(1, math.sin(math.pi*t)*4)**.5
                crease = 1-.10*math.exp(-((t-.38)/.055)**2)-.09*math.exp(-((t-.69)/.05)**2)
                widths.append(radius*cap*crease*(1-.16*t))
            hand.sweep(points, widths, sides=12)
        thumb = _bezier(((.393, -.029, .886), (.354, -.033, .895),
                         (.349, -.089, .885), (.384, -.096, .865)), 27)
        radii = [.0105*min(1, 4*math.sin(math.pi*i/26))**.5*(1-.23*i/26) for i in range(27)]
        hand.sweep(thumb, radii, sides=12)
        if sign < 0:
            hand.data['vertices'] = [(-x, y, z) for x, y, z in hand.data['vertices']]
            hand.data['faces'] = [tuple(reversed(face)) for face in hand.data['faces']]
        parts.append(hand.data)
    return parts


def build():
    """Return four grouped hair parts and two hands in the ranger part schema."""
    return _hair() + _hands()
