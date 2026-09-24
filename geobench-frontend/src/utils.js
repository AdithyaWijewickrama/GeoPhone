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
    if (ms === null || ms === undefined || ms === '') return '';
    let num = typeof ms === 'number' ? ms : (typeof ms === 'string' && /^\d+(\.\d+)?$/.test(ms.trim()) ? Number(ms) : NaN);
    let d;
    if (!isNaN(num)) {
        if (num > 0 && num < 1e11) {
            num = num * 1000;
        }
        d = new Date(num);
    } else if (ms instanceof Date) {
        d = ms;
    } else {
        d = new Date(ms);
    }
    if (isNaN(d.getTime())) return '';
    const pad = (x, n = 2) => String(x).padStart(n, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

export const formatDateTime = (ms) => {
    if (!ms && ms !== 0) return '';
    let num = typeof ms === 'number' ? ms : (typeof ms === 'string' && /^\d+(\.\d+)?$/.test(ms.trim()) ? Number(ms) : NaN);
    let d;
    if (!isNaN(num)) {
        if (num > 0 && num < 1e11) {
            num = num * 1000;
        }
        d = new Date(num);
    } else if (ms instanceof Date) {
        d = ms;
    } else {
        d = new Date(ms);
    }
    if (isNaN(d.getTime())) return '';
    let year = d.getFullYear();
    if (year < 2000) {
        year = 2026;
    }
    const pad = (x, n = 2) => String(x).padStart(n, '0');
    return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const toDatetimeLocalString = (dateOrMs) => {
    if (!dateOrMs && dateOrMs !== 0) return '';
    let d;
    if (typeof dateOrMs === 'number') {
        let num = dateOrMs;
        if (num > 0 && num < 1e11) num = num * 1000;
        d = new Date(num);
    } else if (typeof dateOrMs === 'string' && /^\d+(\.\d+)?$/.test(dateOrMs.trim())) {
        let num = Number(dateOrMs);
        if (num > 0 && num < 1e11) num = num * 1000;
        d = new Date(num);
    } else if (dateOrMs instanceof Date) {
        d = dateOrMs;
    } else {
        d = new Date(dateOrMs);
    }
    if (!d || isNaN(d.getTime())) return '';
    let year = d.getFullYear();
    if (year < 2000) {
        year = 2026;
    }
    const pad = (n) => n.toString().padStart(2, '0');
    return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const parseFilenameDate = (filename) => {
    if (!filename) return new Date();
    const str = String(filename);
    const match = str.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[_T\s-](\d{2})[-:]?(\d{2})[-:]?(\d{2})/);
    if (match) {
        const [, year, month, day, hour, min, sec] = match;
        const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
        if (!isNaN(d.getTime())) return d;
    }
    const epochMatch = str.match(/(\d{10,13})/);
    if (epochMatch) {
        let val = Number(epochMatch[1]);
        if (val < 1e11) val *= 1000;
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
};

export const getFileDateMs = (file) => {
    if (!file) return Date.now();
    const parsed = parseFilenameDate(file.name);
    if (parsed && !isNaN(parsed.getTime())) {
        return parsed.getTime();
    }
    if (file.lastModified && file.lastModified > 86400000) {
        return file.lastModified;
    }
    return Date.now();
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