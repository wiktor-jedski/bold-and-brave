"""Fresh metre-scale ranger anatomy, independent of Blender and previous assets.

X is horizontal, -Y is anterior, Z is up; +X is the character's left.
Hidden shoulder and hip joins overlap beneath garments. Each entire limb is a
single closed surface, including its joint, rather than separate muscle pieces.
"""

from math import cos, hypot, pi, sin


def _surface(name, rings, deform):
    """Join counterclockwise, bottom-to-top rings and close the hidden ends."""
    count = len(rings[0])
    vertices = [point for ring in rings for point in ring]
    faces = []
    for row in range(len(rings) - 1):
        lower = row * count
        upper = lower + count
        for column in range(count):
            following = (column + 1) % count
            faces.append((lower + column, lower + following,
                          upper + following, upper + column))
    # A centre fan avoids nonplanar n-gons at the inclined shoulder/hip ends.
    for row, bottom in ((0, True), (len(rings) - 1, False)):
        ring = rings[row]
        centre = len(vertices)
        vertices.append(tuple(sum(point[axis] for point in ring) / count
                              for axis in range(3)))
        start = row * count
        for column in range(count):
            following = (column + 1) % count
            faces.append((centre, start + following, start + column) if bottom
                         else (centre, start + column, start + following))
    return {"name": name, "vertices": vertices, "faces": faces,
            "material": "Skin", "deform": deform}


def _torso():
    # z, halfwidth, anterior depth, posterior depth, Y centre, shoulder fall.
    # The iliac flare, narrowed waist, lower ribs and clavicular shelf are
    # separate silhouette changes; the final sloping rings form the trapezius.
    profile = (
        (.875, .116, .065, .081, .010, .000),
        (.905, .143, .081, .096, .007, .000),
        (.945, .158, .087, .105, .004, .000),
        (.980, .160, .087, .103, .002, .000),
        (1.025, .154, .082, .096, .000, .000),
        (1.075, .146, .077, .085, .000, .000),
        (1.115, .145, .079, .082, .000, .000),
        (1.165, .151, .084, .084, .000, .000),
        (1.215, .164, .093, .089, .000, .000),
        (1.265, .180, .101, .095, .000, .000),
        (1.315, .189, .105, .100, .000, .000),
        (1.365, .191, .104, .103, .000, .000),
        (1.410, .193, .096, .099, .000, .000),
        (1.450, .207, .081, .086, .000, .009),
        (1.480, .218, .063, .071, .000, .025),
        (1.510, .153, .052, .065, .003, .032),
        (1.528, .097, .047, .057, .006, .017),
        (1.543, .057, .043, .048, .008, .003),
        (1.570, .050, .042, .046, .009, .000),
        (1.602, .051, .043, .047, .008, .000),
        (1.621, .055, .045, .048, .006, .000),
    )
    rings = []
    for z, width, front, back, cy, fall in profile:
        ring = []
        for column in range(24):
            angle = 2 * pi * column / 24
            across, depth = cos(angle), sin(angle)
            # A shallow sternal plane and lumbar hollow, not a circular barrel.
            y = cy + depth * (front if depth < 0 else back)
            ring.append((width * across, y, z - fall * abs(across) ** 2))
        rings.append(ring)
    return _surface("Ranger anatomical trunk and neck", rings, "body")


def _limb(name, profile, side, deform):
    """Loft anatomical stations normal to their sagittal-plane centreline.

    Stations: positive X, Y, Z, transverse radius, anterior radius,
    posterior radius. The small Y bend stays in the centreline, leaving the
    cross sections' anterior direction aligned with the clothes and patella.
    """
    rings = []
    for index, (x, y, z, width, front, back) in enumerate(profile):
        before = profile[max(0, index - 1)]
        after = profile[min(len(profile) - 1, index + 1)]
        dx = side * (after[0] - before[0])
        dz = after[2] - before[2]
        length = hypot(dx, dz)
        # e1 cross +Y points up the limb; mirroring the centreline never
        # reflects the ring frame, so both sides retain outward winding.
        ex, ez = dz / length, -dx / length
        rings.append([
            (side * x + width * cos(angle) * ex,
             y + sin(angle) * (front if sin(angle) < 0 else back),
             z + width * cos(angle) * ez)
            for angle in (2 * pi * column / 20 for column in range(20))
        ])
    return _surface(name, rings, deform)


def build():
    """Return five closed skin meshes; no scene access, head, hands or feet."""
    # Wrist to deltoid: radius changes are continuous across the elbow.
    # Forearm fullness sits proximally, not at the wrist; the elbow has a
    # narrower transverse section and a posterior olecranon prominence.
    arm = (
        (.370, -.030, .900, .026, .022, .021),
        (.367, -.029, .914, .027, .024, .022),
        (.363, -.028, .932, .030, .028, .025),
        (.357, -.027, .953, .034, .032, .028),
        (.351, -.025, .976, .038, .037, .032),
        (.345, -.023, 1.000, .042, .042, .036),
        (.339, -.021, 1.025, .046, .047, .040),
        (.333, -.019, 1.050, .048, .049, .044),
        (.327, -.017, 1.075, .048, .048, .044),
        (.321, -.015, 1.100, .045, .043, .041),
        (.315, -.013, 1.126, .039, .035, .038),
        (.309, -.012, 1.148, .035, .030, .037),
        (.305, -.012, 1.165, .036, .031, .041),
        (.300, -.010, 1.181, .038, .034, .040),
        (.294, -.009, 1.201, .041, .040, .044),
        (.286, -.006, 1.227, .046, .047, .050),
        (.276, -.003, 1.258, .050, .053, .055),
        (.266, .000, 1.291, .053, .057, .058),
        (.256, .002, 1.324, .055, .059, .060),
        (.246, .003, 1.356, .057, .058, .060),
        (.236, .002, 1.388, .060, .059, .061),
        (.226, .001, 1.420, .063, .060, .062),
        (.215, .000, 1.455, .058, .053, .057),
        (.204, .000, 1.476, .045, .042, .045),
        (.195, .000, 1.489, .029, .030, .032),
    )
    # Ankle to hip: Achilles narrowing, posterior calf belly, patellar
    # projection and the distal quadriceps teardrop all belong to one shell.
    leg = (
        (.110, -.010, .100, .030, .030, .027),
        (.110, -.009, .121, .032, .032, .030),
        (.110, -.008, .147, .029, .030, .032),
        (.110, -.006, .175, .031, .031, .036),
        (.110, -.004, .205, .035, .033, .043),
        (.110, -.001, .238, .042, .037, .054),
        (.110, .003, .273, .050, .041, .067),
        (.110, .006, .309, .058, .045, .076),
        (.109, .007, .344, .062, .048, .080),
        (.108, .005, .379, .061, .048, .076),
        (.107, .001, .411, .055, .044, .065),
        (.106, -.005, .441, .049, .041, .053),
        (.105, -.011, .467, .045, .043, .044),
        (.105, -.017, .493, .046, .050, .043),
        (.105, -.020, .515, .047, .054, .044),
        (.104, -.019, .536, .049, .052, .045),
        (.103, -.016, .558, .054, .054, .049),
        (.102, -.012, .584, .061, .060, .055),
        (.101, -.007, .616, .065, .065, .063),
        (.100, -.003, .654, .068, .071, .070),
        (.099, .000, .695, .072, .076, .077),
        (.097, .003, .737, .076, .080, .082),
        (.095, .005, .780, .079, .083, .087),
        (.094, .005, .822, .080, .084, .091),
        (.093, .003, .862, .079, .083, .094),
        (.092, .001, .902, .077, .081, .093),
        (.092, .000, .935, .073, .078, .087),
        (.089, .000, .963, .065, .068, .076),
        (.085, .001, .985, .051, .054, .059),
    )
    parts = [_torso()]
    for side, suffix in ((1, "L"), (-1, "R")):
        parts.append(_limb("Ranger continuous shoulder arm " + suffix,
                           arm, side, "arm." + suffix))
        parts.append(_limb("Ranger continuous thigh calf " + suffix,
                           leg, side, "leg." + suffix))
    return parts
