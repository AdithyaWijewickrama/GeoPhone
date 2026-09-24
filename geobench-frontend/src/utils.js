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

export const formatDateTime = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    const pad = (x, n = 2) => String(x).padStart(n, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const toDatetimeLocalString = (dateOrMs) => {
    if (!dateOrMs) return '';
    const date = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
    if (!date || isNaN(date.getTime())) return '';
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const parseFilenameDate = (filename) => {
    if (!filename) return new Date();
    const match = filename.match(/(\d{4}-\d{2}-\d{2}[_T]\d{2}[-:]\d{2}[-:]\d{2})/);
    if (!match) return new Date();
    const raw = match[1];
    const parts = raw.split(/[_T]/);
    return new Date(`${parts[0]}T${parts[1].replace(/-/g, ':')}`);
};

export const getFileDateMs = (file) => {
    if (!file) return Date.now();
    const parsed = parseFilenameDate(file.name);
    if (parsed && !isNaN(parsed.getTime())) {
        return parsed.getTime();
    }
    return file.lastModified || Date.now();
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