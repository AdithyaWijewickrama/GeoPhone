import React from 'react';

export default function SpectrogramModal({
    plotModal,
    onClose
}) {
    if (!plotModal || !plotModal.visible) return null;

    return (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1060 }}>
            <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content bg-dark border-secondary">
                    <div className="modal-header border-secondary">
                        <h5 className="modal-title text-light">Event Analysis & Spectrogram</h5>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={onClose}
                        ></button>
                    </div>
                    <div
                        className="modal-body text-center p-0"
                        style={{
                            minHeight: '300px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {plotModal.loading && <div className="spinner-border text-warning" role="status"></div>}
                        {plotModal.error && (
                            <div className="text-danger p-4">Error generating plot: {plotModal.error}</div>
                        )}
                        {plotModal.image && (
                            <img
                                src={`data:image/png;base64,${plotModal.image}`}
                                alt="Event Spectrogram"
                                className="img-fluid w-100"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
