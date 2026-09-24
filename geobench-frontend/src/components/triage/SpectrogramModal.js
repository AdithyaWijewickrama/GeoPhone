import React from 'react';

export default function SpectrogramModal({
    plotModal,
    onClose
}) {
    if (!plotModal || !plotModal.visible) return null;

    const handleDownload = () => {
        if (!plotModal.image) return;
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${plotModal.image}`;
        link.download = `event-analysis-plot-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1060 }} onClick={onClose}>
            <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
                <div className="modal-content bg-dark border-secondary shadow-lg">
                    <div className="modal-header border-secondary">
                        <div className="d-flex align-items-center gap-2">
                            <span style={{ fontSize: '1.2rem' }}>📈</span>
                            <div>
                                <h5 className="modal-title text-light mb-0">Event Analysis & Spectrogram</h5>
                                {plotModal.title && (
                                    <small className="text-warning">{plotModal.title}</small>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={onClose}
                        ></button>
                    </div>
                    <div
                        className="modal-body text-center p-2"
                        style={{
                            minHeight: '350px',
                            backgroundColor: '#16120e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {plotModal.loading && (
                            <div className="d-flex flex-column align-items-center gap-3 p-5">
                                <div className="spinner-border text-warning" role="status"></div>
                                <span className="text-muted">Generating 3-panel spectrogram and waveform analysis...</span>
                            </div>
                        )}
                        {plotModal.error && (
                            <div className="text-danger p-4 fw-semibold">
                                ⚠️ Error generating plot: {plotModal.error}
                            </div>
                        )}
                        {plotModal.image && (
                            <img
                                src={`data:image/png;base64,${plotModal.image}`}
                                alt="Event Spectrogram"
                                className="img-fluid w-100 rounded"
                                style={{ maxHeight: '75vh', objectFit: 'contain' }}
                            />
                        )}
                    </div>
                    <div className="modal-footer border-secondary justify-content-between">
                        <span className="text-muted small">
                            Includes Time-Domain Waveform, Zoomed Event Analysis, and STFT Spectrogram Heatmap.
                        </span>
                        <div className="d-flex gap-2">
                            {plotModal.image && (
                                <button
                                    type="button"
                                    className="btn btn-outline-info btn-sm fw-bold"
                                    onClick={handleDownload}
                                >
                                    💾 Download Plot
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm px-3"
                                onClick={onClose}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
