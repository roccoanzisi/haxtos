const HBSLoader = (function () {

    function resolveTraits(hbs) {
        const traits = hbs.traits || {};
        function applyTrait(obj) {
            if (!obj.trait) return;
            const t = traits[obj.trait];
            if (!t) return;
            for (const k of Object.keys(t)) {
                if (!(k in obj)) obj[k] = t[k];
            }
        }
        for (const v of (hbs.vertexes || [])) applyTrait(v);
        for (const s of (hbs.segments || [])) applyTrait(s);
        for (const d of (hbs.discs   || [])) applyTrait(d);
        for (const p of (hbs.planes  || [])) applyTrait(p);
    }

    function parseColor(hex) {
        if (hex == null) return null;
        if (typeof hex === 'number') return hex;
        const h = String(hex).replace('#', '');
        const v = parseInt(h, 16);
        return isNaN(v) ? null : v;
    }

    function load(json) {
        const hbs = JSON.parse(json);
        resolveTraits(hbs);
        return hbs;
    }

    function getFieldData(hbs) {
        const bg = hbs.bg || {};
        const bw = bg.width  || 420;
        const bh = bg.height || 200;

        // Goals sorted left→right
        const goals = (hbs.goals || []).map(g => ({
            p0: { x: g.p0[0], y: g.p0[1] },
            p1: { x: g.p1[0], y: g.p1[1] },
            team: g.team
        })).sort((a, b) => a.p0.x - b.p0.x);

        // Goal height from first goal (left)
        let goalH = bh * 0.65;
        if (goals.length > 0) {
            const g = goals[0];
            goalH = Math.abs(g.p1.y - g.p0.y);
        }

        // Outer physics/camera bounds
        const camW = hbs.width  || bw + 60;
        const camH = hbs.height || bh + 20;

        // Static discs (goal posts): invMass=0
        const staticDiscs = (hbs.discs || []).filter(d => d.invMass === 0);

        return {
            name: hbs.name || 'HBS Map',
            W: bw * 2,
            H: bh * 2,
            bgWidth:  bw,
            bgHeight: bh,
            GOAL_H:   goalH,
            GOAL_D:   35,
            camW, camH,
            goals,
            spawnDist:    hbs.spawnDistance || 100,
            bgType:       bg.type  || 'grass',
            bgColor:      bg.color != null ? parseColor(bg.color) : null,
            kickOffRadius: bg.kickOffRadius || 75,
            cornerRadius:  bg.cornerRadius  || 0,
            ballPhysics:   hbs.ballPhysics   || null,
            playerPhysics: hbs.playerPhysics || null,
            segments:      hbs.segments      || [],
            vertexes:      hbs.vertexes      || [],
            planes:        hbs.planes        || [],
            staticDiscs,
        };
    }

    // Draw one HBS segment (straight or arc) in world coordinates.
    // curveDeg: arc angle in degrees (HBS convention, 0 = straight line).
    function drawSegment(g, p0, p1, curveDeg) {
        if (!curveDeg || Math.abs(curveDeg) < 0.1) {
            g.lineBetween(p0.x, p0.y, p1.x, p1.y);
            return;
        }

        const theta = curveDeg * Math.PI / 180;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const chord = Math.hypot(dx, dy);
        if (chord < 0.01) return;

        const r = chord / (2 * Math.abs(Math.sin(theta / 2)));

        // CCW perpendicular of p0→p1
        const px = -dy / chord;
        const py =  dx / chord;

        const halfChord = chord / 2;
        const d = Math.sqrt(Math.max(0, r * r - halfChord * halfChord));

        // Positive curve (HBS y-up) → center on right of p0→p1 in canvas (y-down)
        const sign = theta > 0 ? -1 : 1;
        const cx = (p0.x + p1.x) / 2 + sign * px * d;
        const cy = (p0.y + p1.y) / 2 + sign * py * d;

        const startA = Math.atan2(p0.y - cy, p0.x - cx);
        const endA   = Math.atan2(p1.y - cy, p1.x - cx);

        // Sweep: arc spans |theta| in the correct direction
        let sweep = endA - startA;
        if (theta > 0) { if (sweep > 0) sweep -= 2 * Math.PI; }
        else           { if (sweep < 0) sweep += 2 * Math.PI; }

        const N = Math.max(8, Math.ceil(Math.abs(curveDeg) / 8));
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        for (let i = 1; i <= N; i++) {
            const a = startA + sweep * (i / N);
            g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        g.strokePath();
    }

    return { load, getFieldData, drawSegment, parseColor };
})();
