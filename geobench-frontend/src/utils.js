export const mergeEvents = (blocks, threshold) => {
    let events = [];
    let cur = null;
    for (let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        if (b.score >= threshold) {
            if (!cur) cur = {
                startTime: b.time,
                endTime: b.time,
                startIdx: b.s,
                endIdx: b.e,
                peakScore: b.score,
                peakBlock: b
            };
            else {
                cur.endTime = b.time;
                cur.endIdx = b.e;
                if (b.score > cur.peakScore) {
                    cur.peakScore = b.score;
                    cur.peakBlock = b;
                }
            }
        } else if (cur) {
            events.push(cur);
            cur = null;
        }
    }
    if (cur) events.push(cur);
    return events;
};

export const formatTime = (ms) => {
    const d = new Date(ms);
    const pad = (x, n = 2) => String(x).padStart(n, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

export const formatDuration = (ms) => {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`; // e.g., 450ms
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(2)}s`; // e.g., 4.25s
    }
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`; // e.g., 2m 14.5s
};