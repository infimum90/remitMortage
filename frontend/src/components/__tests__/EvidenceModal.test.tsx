import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EvidenceModal } from '../EvidenceModal';

const mockMilestoneImage = {
  title: 'Foundation Poured',
  description: 'Initial concrete pouring for the north wing.',
  cid: 'QmTestHash12345/image.png',
  size: '2.4 MB',
  dateUploaded: '2026-06-24',
};

const mockMilestoneVideo = {
  ...mockMilestoneImage,
  cid: 'QmTestHashVideo/video.mp4',
};

describe('EvidenceModal & IPFSMediaPlayer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders image file correctly with valid CID', () => {
    render(<EvidenceModal isOpen={true} onClose={jest.fn()} milestoneData={mockMilestoneImage} />);
    
    const img = screen.getByTestId('ipfs-image') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('https://cloudflare-ipfs.com/ipfs/QmTestHash12345/image.png');
    
    // Simulate image load
    fireEvent.load(img);
    
    // Loading indicator should disappear
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  it('renders video file with controls given a video CID', () => {
    render(<EvidenceModal isOpen={true} onClose={jest.fn()} milestoneData={mockMilestoneVideo} />);
    
    const video = screen.getByTestId('ipfs-video') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('controls');
    expect(video.src).toContain('https://cloudflare-ipfs.com/ipfs/QmTestHashVideo/video.mp4');
  });

  it('switches to fallback gateway on primary gateway timeout', () => {
    render(<EvidenceModal isOpen={true} onClose={jest.fn()} milestoneData={mockMilestoneImage} />);
    
    const img = screen.getByTestId('ipfs-image') as HTMLImageElement;
    expect(img.src).toContain('https://cloudflare-ipfs.com/ipfs/');
    
    // Advance time by 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    
    // The source should now use the fallback gateway
    expect(img.src).toContain('https://ipfs.io/ipfs/');
  });

  it('switches to fallback gateway immediately on load error', () => {
    render(<EvidenceModal isOpen={true} onClose={jest.fn()} milestoneData={mockMilestoneImage} />);
    
    const img = screen.getByTestId('ipfs-image') as HTMLImageElement;
    
    // Simulate load error on primary gateway
    fireEvent.error(img);
    
    expect(img.src).toContain('https://ipfs.io/ipfs/');
  });

  it('closes modal when backdrop is clicked', () => {
    const handleClose = jest.fn();
    render(<EvidenceModal isOpen={true} onClose={handleClose} milestoneData={mockMilestoneImage} />);
    
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
  
  it('toggles fullscreen mode for images', () => {
    render(<EvidenceModal isOpen={true} onClose={jest.fn()} milestoneData={mockMilestoneImage} />);
    
    const fullscreenBtn = screen.getByLabelText(/Enter fullscreen view/i);
    expect(fullscreenBtn).toBeInTheDocument();
    
    fireEvent.click(fullscreenBtn);
    
    expect(screen.getByLabelText(/Exit fullscreen view/i)).toBeInTheDocument();
  });
});
