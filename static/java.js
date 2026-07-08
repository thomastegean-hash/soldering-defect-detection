const input = document.getElementById("imageInput");
const image = document.getElementById("mainImage");
const container = document.querySelector(".image-container");

/* ─── Public API ────────────────────────────────────────────────────────────
   window.lastDetections  – array of the last rendered detections, each:
     { class: string, confidence: number, bbox: [x1,y1,x2,y2] }

   window.renderDetections(detections, imgNaturalWidth, imgNaturalHeight)
     Call this with the array returned by detector.py once you have it.
     bbox coords must be absolute pixels in the original image space.
   ──────────────────────────────────────────────────────────────────────── */

window.lastDetections = [];

window.renderDetections = function (detections, natW, natH) {
    // Use the image's own natural dimensions as fallback
    const srcW = natW ?? image.naturalWidth;
    const srcH = natH ?? image.naturalHeight;

    // Remove all previous boxes
    container.querySelectorAll('.square').forEach(el => el.remove());

    window.lastDetections = detections || [];

    detections.forEach(function (det) {
        const [x1, y1, x2, y2] = det.bbox;

        // Convert absolute px → % relative to the original image size
        const leftPct   = (x1 / srcW) * 100;
        const topPct    = (y1 / srcH) * 100;
        const widthPct  = ((x2 - x1) / srcW) * 100;
        const heightPct = ((y2 - y1) / srcH) * 100;

        const box = document.createElement('div');
        box.className = 'square';
        box.style.left   = leftPct   + '%';
        box.style.top    = topPct    + '%';
        box.style.width  = widthPct  + '%';
        box.style.height = heightPct + '%';

        // Label: "ClassName 94%"
        const label = document.createElement('span');
        label.className = 'square-label';
        label.textContent = det.class + ' ' + Math.round(det.confidence * 100) + '%';
        box.appendChild(label);

        container.appendChild(box);
    });

    // Update the info bar
    _updateInfoBar();
};

/* ─── Info bar ──────────────────────────────────────────────────────────── */
function _updateInfoBar() {
    const bar = document.getElementById('detections-bar');
    if (!bar) return;
    const dets = window.lastDetections;
    if (!dets.length) {
        bar.textContent = 'No detections';
        bar.classList.remove('has-detections');
        return;
    }
    bar.classList.add('has-detections');

    const viewBadge = window.lastView
        ? '<span class="det-view-badge">' + window.lastView + '</span>'
        : '';

    const chips = dets.map(function (d) {
        const conf = Math.round(d.confidence * 100);
        const g = conf >= 50 ? 255 : Math.round((conf / 50) * 255);
        const r = conf <= 50 ? 255 : Math.round(((100 - conf) / 50) * 255);
        const color = 'rgb(' + r + ',' + g + ',0)';
        return '<span class="det-chip" style="--chip-color:' + color + '">'
             + '<b>' + d.class + '</b>'
             + '<em>' + conf + '%</em>'
             + '</span>';
    }).join('');

    bar.innerHTML = viewBadge + chips;
}

/* ─── Backend fetch ─────────────────────────────────────────────────────── */
async function _fetchDetections(file) {
    const bar = document.getElementById('detections-bar');

    // Show loading state
    bar.classList.remove('has-detections');
    bar.textContent = 'Detecting…';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/detect', { method: 'POST', body: formData });

        if (!res.ok) {
            bar.textContent = 'Error ' + res.status + ': ' + res.statusText;
            return;
        }

        const data = await res.json();
        // data = { view: "top"|"perspective", detections: [{class, confidence, bbox}] }

        window.lastView = data.view;
        window.renderDetections(data.detections);

    } catch (err) {
        bar.classList.remove('has-detections');
        bar.textContent = 'Network error: ' + err.message;
        console.error('[detect]', err);
    }
}

/* ─── File input ────────────────────────────────────────────────────────── */
input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    // Clear old boxes and info while the new image loads
    container.querySelectorAll('.square').forEach(el => el.remove());
    window.lastDetections = [];
    _updateInfoBar();

    image.onload = () => {
        // Image is displayed — now ask the backend
        _fetchDetections(file);
    };

    image.src = URL.createObjectURL(file);
    image.hidden = false;
});


/* Zoom + pan feature: applies translate() then scale() to .image-container
   as a single CSS transform. Because .square is a child positioned with
   % left/top/width/height relative to that same container, both the zoom
   and the pan carry the square along automatically — no changes needed to
   the existing positioning logic that java.js drives. */
(function () {
    var zoomApi = null;

    function initZoom() {
        var container = document.querySelector('.image-container');
        if (!container) return;

        var scale = 1;
        var minScale = 1;
        var maxScale = 6;
        var step = 0.15;
        var panX = 0;
        var panY = 0;
        var lastLabelPct = 100;
        var wheelRaf = null;
        var pendingWheelDelta = 0;
        var idleTimer = null;

        container.style.transformOrigin = 'center center';

        function setInteracting(active) {
            if (active) {
                clearTimeout(idleTimer);
                container.style.willChange = 'transform';
            } else {
                idleTimer = setTimeout(function () {
                    container.style.willChange = 'auto';
                }, 150);
            }
        }

        function updateScaleLabel(force) {
            var pct = Math.round(scale * 100);
            if (force || Math.abs(pct - lastLabelPct) >= 5 || pct === 100) {
                resetBtn.textContent = pct + '%';
                lastLabelPct = pct;
            }
        }

        function applyTransform(withTransition, forceLabel) {
            scale = Math.min(maxScale, Math.max(minScale, scale));
            // once back at 100% there is nothing to pan, snap back to center
            if (scale === 1) { panX = 0; panY = 0; }

            /* Clamp pan so the image edge can never travel past the frame edge.
               The frame is the original image size; the container is scale× larger.
               Max translation in either axis = (scaledSize - frameSize) / 2
                                              = frameSize * (scale - 1) / 2        */
            var frame = container.parentNode && container.parentNode.classList &&
                        container.parentNode.classList.contains('zoom-frame')
                        ? container.parentNode : null;
            if (frame) {
                var maxPanX = (frame.offsetWidth  * (scale - 1)) / 2;
                var maxPanY = (frame.offsetHeight * (scale - 1)) / 2;
                panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
                panY = Math.min(maxPanY, Math.max(-maxPanY, panY));
            }

            container.style.transition = withTransition ? 'transform 0.12s ease-out' : 'none';
            container.style.transform = 'translate3d(' + panX + 'px, ' + panY + 'px, 0) scale(' + scale + ')';
            container.style.cursor = scale > 1 ? 'grab' : 'default';
            updateScaleLabel(forceLabel);
        }

        function handleWheel(e) {
            e.preventDefault();
            setInteracting(true);
            pendingWheelDelta += e.deltaY;
            if (!wheelRaf) {
                wheelRaf = requestAnimationFrame(function () {
                    wheelRaf = null;
                    var delta = pendingWheelDelta;
                    pendingWheelDelta = 0;
                    scale -= delta * 0.002;
                    applyTransform(false);
                    setInteracting(false);
                });
            }
        }

        // pinch-to-zoom on touch devices
        var lastDist = null;
        container.addEventListener('touchmove', function (e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                setInteracting(true);
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                var dist = Math.hypot(dx, dy);
                if (lastDist !== null) {
                    scale += (dist - lastDist) * 0.01;
                    applyTransform(false);
                }
                lastDist = dist;
            }
        }, { passive: false });
        container.addEventListener('touchend', function (e) {
            if (e.touches.length < 2) {
                lastDist = null;
                updateScaleLabel(true);
                setInteracting(false);
            }
        });

        // drag-to-pan with the mouse, only while zoomed in
        var isPanning = false;
        var startX = 0, startY = 0, basePanX = 0, basePanY = 0;

        container.addEventListener('mousedown', function (e) {
            if (scale <= 1) return;
            isPanning = true;
            setInteracting(true);
            startX = e.clientX;
            startY = e.clientY;
            basePanX = panX;
            basePanY = panY;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', function (e) {
            if (!isPanning) return;
            panX = basePanX + (e.clientX - startX);
            panY = basePanY + (e.clientY - startY);
            applyTransform(false);
        });

        window.addEventListener('mouseup', function () {
            if (!isPanning) return;
            isPanning = false;
            container.style.cursor = scale > 1 ? 'grab' : 'default';
            setInteracting(false);
        });

        // one-finger drag-to-pan on touch (two fingers is reserved for pinch)
        var touchPanning = false;
        container.addEventListener('touchstart', function (e) {
            if (scale > 1 && e.touches.length === 1) {
                touchPanning = true;
                setInteracting(true);
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                basePanX = panX;
                basePanY = panY;
            }
        }, { passive: true });

        container.addEventListener('touchmove', function (e) {
            if (touchPanning && e.touches.length === 1) {
                e.preventDefault();
                panX = basePanX + (e.touches[0].clientX - startX);
                panY = basePanY + (e.touches[0].clientY - startY);
                applyTransform(false);
            }
        }, { passive: false });

        container.addEventListener('touchend', function (e) {
            if (e.touches.length === 0) {
                touchPanning = false;
                setInteracting(false);
            }
        });

        // floating +/-/reset controls, injected purely via JS so the
        // existing markup does not need to change. Placed in a fixed
        // toolbar so a zoomed-in (visually larger) image can never cover
        // them, unlike a normal sibling in the document flow.
        var controls = document.createElement('div');
        controls.className = 'zoom-controls';

        var outBtn = document.createElement('button');
        outBtn.type = 'button';
        outBtn.textContent = '\u2013';
        outBtn.setAttribute('aria-label', 'Micsoreaza');

        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.setAttribute('data-zoom', 'reset');
        resetBtn.textContent = '100%';
        resetBtn.setAttribute('aria-label', 'Reseteaza zoom');

        var inBtn = document.createElement('button');
        inBtn.type = 'button';
        inBtn.textContent = '+';
        inBtn.setAttribute('aria-label', 'Mareste');

        outBtn.addEventListener('click', function () { scale -= step; applyTransform(true, true); });
        inBtn.addEventListener('click', function () { scale += step; applyTransform(true, true); });
        resetBtn.addEventListener('click', function () { scale = 1; panX = 0; panY = 0; applyTransform(true, true); });

        controls.appendChild(outBtn);
        controls.appendChild(resetBtn);
        controls.appendChild(inBtn);
        document.body.appendChild(controls);

        zoomApi = {
            attachWheelTarget: function (target) {
                if (!target) return;
                target.addEventListener('wheel', handleWheel, { passive: false });
            }
        };
    }

    /* ---------- zoom-frame: wrap .image-container in a clipping box ----------
       Done at runtime (not in HTML) so the body markup stays untouched.
       The frame is sized to match the image's rendered dimensions, giving
       a fixed viewport: zoom/pan happen inside it and anything outside is
       simply hidden — exactly like zooming a map inside a card.
       Wheel zoom is attached once on the frame (not re-dispatched). */
    function initFrame() {
        var img = document.getElementById('mainImage');
        var container = document.querySelector('.image-container');
        if (!img || !container) return;

        function buildFrame() {
            /* already wrapped — do nothing */
            if (container.parentNode && container.parentNode.classList.contains('zoom-frame')) return;

            var w = img.offsetWidth;
            var h = img.offsetHeight;
            if (!w || !h) return; /* image not laid out yet */

            var frame = document.createElement('div');
            frame.className = 'zoom-frame';
            frame.style.width  = w + 'px';
            frame.style.height = h + 'px';

            /* insert the frame where the container currently sits, then move
               the container inside it — parent reference survives for java.js */
            container.parentNode.insertBefore(frame, container);
            frame.appendChild(container);

            if (zoomApi) zoomApi.attachWheelTarget(frame);
        } // closes buildFrame()

        if (!img.hidden && img.complete && img.naturalWidth) {
            buildFrame();
        } else {
            /* Watch for the image being revealed (java.js removes [hidden] and
               sets the src). A MutationObserver catches the attribute change. */
            var mo = new MutationObserver(function () {
                if (!img.hidden) {
                    if (img.complete && img.naturalWidth) {
                        buildFrame();
                        mo.disconnect();
                    } else {
                        img.addEventListener('load', function onLoad() {
                            buildFrame();
                            img.removeEventListener('load', onLoad);
                            mo.disconnect();
                        });
                    }
                }
            });
            mo.observe(img, { attributes: true, attributeFilter: ['hidden', 'src'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initZoom(); initFrame(); });
    } else {

        initZoom();
        initFrame();
    }
})();
