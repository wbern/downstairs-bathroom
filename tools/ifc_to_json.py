#!/usr/bin/env python3
"""Extract triangulated geometry from an IFC2X3 (Archicad) file into JSON for the web viewer.

Handles the subset Archicad emits here: faceted breps, shell-based surface models,
mapped items, and IfcLocalPlacement chains. Lengths are converted to metres.
"""
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- STEP parsing

ENTITY_RE = re.compile(r"#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\)\s*;\s*$", re.S)


def split_args(s):
    """Split a STEP argument list on top-level commas, respecting quotes and nesting."""
    out, depth, buf, in_str = [], 0, [], False
    i = 0
    while i < len(s):
        c = s[i]
        if in_str:
            if c == "'":
                # '' is an escaped quote inside a STEP string
                if i + 1 < len(s) and s[i + 1] == "'":
                    buf.append("''")
                    i += 2
                    continue
                in_str = False
            buf.append(c)
        elif c == "'":
            in_str = True
            buf.append(c)
        elif c in "([":
            depth += 1
            buf.append(c)
        elif c in ")]":
            depth -= 1
            buf.append(c)
        elif c == "," and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1
    out.append("".join(buf).strip())
    return out


def parse_file(path):
    """Return {id: (type, [raw args])}. Entities may span multiple lines."""
    text = Path(path).read_text(errors="replace")
    text = text[text.index("DATA;") + 5 : text.rindex("ENDSEC;")]
    entities = {}
    for chunk in text.split(";"):
        chunk = chunk.strip()
        if not chunk.startswith("#"):
            continue
        m = ENTITY_RE.match(chunk + ";")
        if not m:
            continue
        eid, etype, args = m.groups()
        entities[int(eid)] = (etype, split_args(args))
    return entities


def ref(a):
    """Parse a '#123' reference into an int, else None."""
    a = a.strip()
    return int(a[1:]) if a.startswith("#") and a[1:].isdigit() else None


def reflist(a):
    a = a.strip()
    if not (a.startswith("(") and a.endswith(")")):
        return []
    return [r for r in (ref(x) for x in split_args(a[1:-1])) if r is not None]


def _ratio(a):
    """Unwrap IFCNORMALISEDRATIOMEASURE(0.8) / a bare number / '$' -> float or None."""
    a = (a or "").strip()
    if not a or a == "$":
        return None
    m = re.search(r"\(([-0-9.eE+]+)\)", a)
    try:
        return float(m.group(1) if m else a)
    except ValueError:
        return None


def unescape(s):
    """Strip STEP quotes and decode Archicad's \\X\\HH latin-1 escapes."""
    s = s.strip()
    if s.startswith("'") and s.endswith("'"):
        s = s[1:-1]
    s = s.replace("''", "'")
    s = re.sub(r"\\X\\([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]).decode("latin-1"), s)
    s = re.sub(
        r"\\X2\\([0-9A-Fa-f]+)\\X0\\",
        lambda m: "".join(
            chr(int(m.group(1)[i : i + 4], 16)) for i in range(0, len(m.group(1)), 4)
        ),
        s,
    )
    return s


# ------------------------------------------------------------------- transforms


def mat_identity():
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def mat_mul(a, b):
    """Row-major 4x4 multiply: result = a * b (apply b first, then a)."""
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4))
    return out


def mat_apply(m, p):
    x, y, z = p
    return (
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    )


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def norm(v):
    L = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5
    return (v[0] / L, v[1] / L, v[2] / L) if L > 1e-12 else (0.0, 0.0, 0.0)


class Model:
    def __init__(self, entities):
        self.e = entities
        self._pt_cache = {}
        self._placement_cache = {}

    def typ(self, eid):
        return self.e[eid][0] if eid in self.e else None

    def args(self, eid):
        return self.e[eid][1]

    def point(self, eid):
        if eid not in self._pt_cache:
            vals = split_args(self.args(eid)[0].strip()[1:-1])
            c = [float(v) for v in vals]
            while len(c) < 3:
                c.append(0.0)
            self._pt_cache[eid] = tuple(c[:3])
        return self._pt_cache[eid]

    def direction(self, eid):
        vals = split_args(self.args(eid)[0].strip()[1:-1])
        c = [float(v) for v in vals]
        while len(c) < 3:
            c.append(0.0)
        return tuple(c[:3])

    def axis2placement(self, eid):
        """IfcAxis2Placement3D/2D -> 4x4 matrix."""
        t = self.typ(eid)
        a = self.args(eid)
        loc = self.point(ref(a[0]))
        if t == "IFCAXIS2PLACEMENT2D":
            refd = self.direction(ref(a[1])) if len(a) > 1 and ref(a[1]) else (1.0, 0.0, 0.0)
            x = norm((refd[0], refd[1], 0.0))
            z = (0.0, 0.0, 1.0)
            y = cross(z, x)
            return [x[0], y[0], z[0], loc[0],
                    x[1], y[1], z[1], loc[1],
                    x[2], y[2], z[2], loc[2],
                    0, 0, 0, 1]
        axis = self.direction(ref(a[1])) if len(a) > 1 and ref(a[1]) else (0.0, 0.0, 1.0)
        refd = self.direction(ref(a[2])) if len(a) > 2 and ref(a[2]) else (1.0, 0.0, 0.0)
        z = norm(axis)
        # Gram-Schmidt refd against z to get x
        d = refd[0] * z[0] + refd[1] * z[1] + refd[2] * z[2]
        x = norm((refd[0] - d * z[0], refd[1] - d * z[1], refd[2] - d * z[2]))
        y = cross(z, x)
        return [x[0], y[0], z[0], loc[0],
                x[1], y[1], z[1], loc[1],
                x[2], y[2], z[2], loc[2],
                0, 0, 0, 1]

    def placement(self, eid):
        """IfcLocalPlacement -> absolute 4x4, walking PlacementRelTo."""
        if eid is None:
            return mat_identity()
        if eid in self._placement_cache:
            return self._placement_cache[eid]
        a = self.args(eid)
        parent = ref(a[0])
        rel = self.axis2placement(ref(a[1]))
        m = mat_mul(self.placement(parent), rel) if parent else rel
        self._placement_cache[eid] = m
        return m

    def transform_operator(self, eid):
        """IfcCartesianTransformationOperator3D -> 4x4 (with uniform scale)."""
        a = self.args(eid)
        axis1 = self.direction(ref(a[0])) if ref(a[0]) else (1.0, 0.0, 0.0)
        axis2 = self.direction(ref(a[1])) if ref(a[1]) else (0.0, 1.0, 0.0)
        origin = self.point(ref(a[2])) if ref(a[2]) else (0.0, 0.0, 0.0)
        scale = float(a[3]) if len(a) > 3 and a[3] not in ("$", "*") else 1.0
        axis3 = self.direction(ref(a[4])) if len(a) > 4 and ref(a[4]) else None
        x = norm(axis1)
        d = axis2[0] * x[0] + axis2[1] * x[1] + axis2[2] * x[2]
        y = norm((axis2[0] - d * x[0], axis2[1] - d * x[1], axis2[2] - d * x[2]))
        z = norm(axis3) if axis3 else cross(x, y)
        s = scale
        return [x[0] * s, y[0] * s, z[0] * s, origin[0],
                x[1] * s, y[1] * s, z[1] * s, origin[1],
                x[2] * s, y[2] * s, z[2] * s, origin[2],
                0, 0, 0, 1]

    # ---------------------------------------------------------- surface styles

    def build_styles(self):
        """Map representation-item id -> {name, rgb, transparency, diffuse, specular}."""
        self.style_of = {}
        for eid, (t, a) in self.e.items():
            if t != "IFCSTYLEDITEM":
                continue
            target = ref(a[0])
            if target is None:
                continue
            for sid in reflist(a[1]):
                st = self.resolve_style(sid)
                if st:
                    self.style_of[target] = st
                    break

    def resolve_style(self, sid):
        t = self.typ(sid)
        if t == "IFCPRESENTATIONSTYLEASSIGNMENT":
            for s in reflist(self.args(sid)[0]):
                r = self.resolve_style(s)
                if r:
                    return r
            return None
        if t != "IFCSURFACESTYLE":
            return None
        a = self.args(sid)
        name = unescape(a[0]).strip()
        for s in reflist(a[2]):
            if self.typ(s) != "IFCSURFACESTYLERENDERING":
                continue
            sa = self.args(s)
            col = ref(sa[0])
            if col is None:
                continue
            ca = self.args(col)
            rgb = [round(float(ca[i]), 4) for i in (1, 2, 3)]
            return {
                "name": name,
                "rgb": rgb,
                "transparency": _ratio(sa[1]) or 0.0,
                "diffuse": _ratio(sa[2]),
                "specular": _ratio(sa[6]) if len(sa) > 6 else None,
            }
        return None


# ---------------------------------------------------------------- triangulation


def triangulate(outer, holes):
    """Ear-clip a 3D planar polygon (with holes) -> list of index triples into `outer+holes` flat list.

    Returns triangles as triples of (ring_index, vertex_index) resolved to a flat point list.
    """
    pts = list(outer)
    rings = [list(range(len(outer)))]
    for h in holes:
        start = len(pts)
        pts.extend(h)
        rings.append(list(range(start, len(pts))))

    if len(pts) < 3:
        return pts, []

    # Newell normal of the outer ring gives the projection plane.
    nx = ny = nz = 0.0
    n = len(outer)
    for i in range(n):
        a, b = outer[i], outer[(i + 1) % n]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    nrm = norm((nx, ny, nz))
    if nrm == (0.0, 0.0, 0.0):
        return pts, []

    # Build a 2D basis on the plane.
    tmp = (0.0, 0.0, 1.0) if abs(nrm[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = norm(cross(tmp, nrm))
    v = cross(nrm, u)

    def to2d(p):
        return (p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
                p[0] * v[0] + p[1] * v[1] + p[2] * v[2])

    p2 = [to2d(p) for p in pts]

    def area(ring):
        s = 0.0
        for i in range(len(ring)):
            a, b = p2[ring[i]], p2[ring[(i + 1) % len(ring)]]
            s += a[0] * b[1] - b[0] * a[1]
        return s / 2

    if area(rings[0]) < 0:
        rings[0].reverse()
    for r in rings[1:]:
        if area(r) > 0:
            r.reverse()

    poly = rings[0]
    # Bridge each hole into the outer ring by its rightmost vertex (adequate for
    # the simple, well-separated openings Archicad produces here).
    for hole in sorted(rings[1:], key=lambda r: -max(p2[i][0] for i in r)):
        hi = max(range(len(hole)), key=lambda k: p2[hole[k]][0])
        best, bestd = None, None
        for k, pi in enumerate(poly):
            d = (p2[pi][0] - p2[hole[hi]][0]) ** 2 + (p2[pi][1] - p2[hole[hi]][1]) ** 2
            if bestd is None or d < bestd:
                best, bestd = k, d
        rot = hole[hi:] + hole[:hi]
        poly = poly[: best + 1] + rot + [rot[0]] + poly[best:]

    def tri_area2(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])

    def inside(a, b, c, p):
        d1 = tri_area2(a, b, p)
        d2 = tri_area2(b, c, p)
        d3 = tri_area2(c, a, p)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

    idx = list(poly)
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 5000:
        guard += 1
        clipped = False
        for i in range(len(idx)):
            ai, bi, ci = idx[i - 1], idx[i], idx[(i + 1) % len(idx)]
            a, b, c = p2[ai], p2[bi], p2[ci]
            if tri_area2(a, b, c) <= 1e-12:
                continue
            if any(
                inside(a, b, c, p2[o])
                for o in idx
                if o not in (ai, bi, ci)
            ):
                continue
            tris.append((ai, bi, ci))
            idx.pop(i)
            clipped = True
            break
        if not clipped:
            break  # degenerate remainder; fan the rest below
    if len(idx) >= 3:
        for i in range(1, len(idx) - 1):
            tris.append((idx[0], idx[i], idx[i + 1]))
    return pts, tris


# ------------------------------------------------------------------- geometry


class GeometryBuilder:
    def __init__(self, model, scale):
        self.m = model
        self.scale = scale

    @staticmethod
    def bucket(buckets, style):
        """One geometry bucket per surface style, so each element splits by material."""
        k = style["name"] if style else ""
        if k not in buckets:
            buckets[k] = {"style": style, "positions": [], "indices": []}
        return buckets[k]

    def face(self, fid, matrix, bucket):
        """IfcFace -> append triangles."""
        verts, tris = bucket["positions"], bucket["indices"]
        bounds = reflist(self.m.args(fid)[0])
        outer, holes = None, []
        for b in bounds:
            bt = self.m.typ(b)
            ba = self.m.args(b)
            loop = ref(ba[0])
            if self.m.typ(loop) != "IFCPOLYLOOP":
                continue
            pts = [self.m.point(p) for p in reflist(self.m.args(loop)[0])]
            orientation = ba[1].strip() if len(ba) > 1 else ".T."
            if orientation == ".F.":
                pts = pts[::-1]
            if bt == "IFCFACEOUTERBOUND" or outer is None:
                if outer is not None:
                    holes.append(outer)
                outer = pts
            else:
                holes.append(pts)
        if not outer or len(outer) < 3:
            return
        pts, tri = triangulate(outer, holes)
        base = len(verts) // 3
        for p in pts:
            wp = mat_apply(matrix, p)
            verts.extend([wp[0] * self.scale, wp[1] * self.scale, wp[2] * self.scale])
        for a, b, c in tri:
            tris.extend([base + a, base + b, base + c])

    def shell(self, sid, matrix, bucket):
        for f in reflist(self.m.args(sid)[0]):
            if self.m.typ(f) in ("IFCFACE", "IFCFACESURFACE"):
                self.face(f, matrix, bucket)

    def item(self, iid, matrix, buckets, style):
        style = self.m.style_of.get(iid, style)
        t = self.m.typ(iid)
        a = self.m.args(iid)
        if t == "IFCFACETEDBREP":
            self.shell(ref(a[0]), matrix, self.bucket(buckets, style))
        elif t == "IFCSHELLBASEDSURFACEMODEL":
            b = self.bucket(buckets, style)
            for s in reflist(a[0]):
                self.shell(s, matrix, b)
        elif t == "IFCMAPPEDITEM":
            src = ref(a[0])
            op = self.m.transform_operator(ref(a[1]))
            sa = self.m.args(src)  # IfcRepresentationMap
            origin = self.m.axis2placement(ref(sa[0]))
            rep = ref(sa[1])
            inner = mat_mul(matrix, mat_mul(op, origin))
            for sub in reflist(self.m.args(rep)[3]):
                self.item(sub, inner, buckets, style)
        elif t in ("IFCBOOLEANRESULT", "IFCBOOLEANCLIPPINGRESULT"):
            self.item(ref(a[1]), matrix, buckets, style)  # first operand only

    def product(self, pid):
        """IfcProduct -> {styleName: bucket} in world space, metres."""
        a = self.m.args(pid)
        placement = self.m.placement(ref(a[5])) if len(a) > 5 and ref(a[5]) else mat_identity()
        shape = ref(a[6]) if len(a) > 6 else None
        buckets = {}
        if shape and self.m.typ(shape) == "IFCPRODUCTDEFINITIONSHAPE":
            for rep in reflist(self.m.args(shape)[2]):
                ra = self.m.args(rep)
                if len(ra) > 1 and unescape(ra[1]) not in ("Body", "Facetation"):
                    continue  # skip Axis / FootPrint / annotation reps
                style = self.m.style_of.get(ref(ra[0]))
                for it in reflist(ra[3]):
                    self.item(it, placement, buckets, style)
        return buckets


# ------------------------------------------------------------------------ main


PRODUCT_TYPES = {
    "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCDOOR", "IFCWINDOW",
    "IFCFURNISHINGELEMENT", "IFCBUILDINGELEMENTPROXY", "IFCCOVERING",
    "IFCRAILING", "IFCCOLUMN", "IFCBEAM", "IFCSTAIR", "IFCFLOWTERMINAL",
}


def main(src, dst):
    ents = parse_file(src)
    model = Model(ents)

    # length unit -> metres
    scale = 1.0
    for eid, (t, a) in ents.items():
        if t == "IFCSIUNIT" and len(a) > 1 and a[1].strip() == ".LENGTHUNIT.":
            prefix = a[2].strip()
            scale = {".MILLI.": 0.001, ".CENTI.": 0.01, ".KILO.": 1000.0}.get(prefix, 1.0)
            break

    # type name per product, via IfcRelDefinesByType
    type_of = {}
    for eid, (t, a) in ents.items():
        if t == "IFCRELDEFINESBYTYPE":
            tid = ref(a[5])
            name = unescape(model.args(tid)[2]) if tid and len(model.args(tid)) > 2 else ""
            for p in reflist(a[4]):
                type_of[p] = name

    model.build_styles()
    gb = GeometryBuilder(model, scale)
    elements = []
    for eid, (t, a) in sorted(ents.items()):
        if t not in PRODUCT_TYPES:
            continue
        buckets = gb.product(eid)
        parts = [{
            "style": (b["style"] or {}).get("name", ""),
            "rgb": (b["style"] or {}).get("rgb"),
            "transparency": (b["style"] or {}).get("transparency", 0.0),
            "diffuse": (b["style"] or {}).get("diffuse"),
            "specular": (b["style"] or {}).get("specular"),
            "positions": [round(v, 5) for v in b["positions"]],
            "indices": b["indices"],
        } for b in buckets.values() if b["indices"]]
        if not parts:
            continue
        elements.append({
            "id": eid,
            "ifcType": t,
            "name": unescape(a[2]) if len(a) > 2 and a[2] != "$" else "",
            "description": unescape(a[3]) if len(a) > 3 and a[3] != "$" else "",
            "typeName": type_of.get(eid, ""),
            "parts": parts,
        })

    coords = [p["positions"] for e in elements for p in e["parts"]]
    xs = [v[i] for v in coords for i in range(0, len(v), 3)]
    ys = [v[i + 1] for v in coords for i in range(0, len(v), 3)]
    zs = [v[i + 2] for v in coords for i in range(0, len(v), 3)]
    styles = {}
    for e in elements:
        for p in e["parts"]:
            styles.setdefault(p["style"], dict(p, positions=None, indices=None, n=0))["n"] += 1
    out = {
        "source": Path(src).name,
        "unitScale": scale,
        "bounds": {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
        "elements": elements,
    }
    Path(dst).write_text(json.dumps(out, separators=(",", ":")))

    ntri = sum(len(p["indices"]) for e in elements for p in e["parts"]) // 3
    print(f"{len(elements)} elements, {sum(len(e['parts']) for e in elements)} parts, {ntri} triangles")
    print("bounds (m):", out["bounds"])
    print("\nsurface styles in the drawing:")
    for name, s in sorted(styles.items(), key=lambda kv: -kv[1]["n"]):
        rgb = s["rgb"]
        hexc = "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in rgb) if rgb else "—"
        print(f"  {s['n']:3d}x  {name or '(ostilad)':34s} {hexc}  "
              f"transp={s['transparency']:.2f} diff={s['diffuse']} spec={s['specular']}")
    print()
    for e in elements:
        used = ", ".join(sorted({p["style"] or "-" for p in e["parts"]}))
        print(f"  #{e['id']:5d} {e['typeName'][:30]:30s} {used[:70]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
