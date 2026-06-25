import { useState, useCallback } from 'react';
import { BrowserProvider } from 'ethers';

export type WalletType = 'stellar' | 'evm' | 'solana' | null;

interface WalletState {
  address: string | null;
  type: WalletType;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export const useMultiWallet = () => {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    type: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const connectEVM = async () => {
    try {
      setWalletState(prev => ({ ...prev, isConnecting: true, error: null }));
      
      // Check for MetaMask/EVM Provider
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask or EVM provider is not installed!');
      }

      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const address = accounts[0];
      
      setWalletState({
        address,
        type: 'evm',
        isConnected: true,
        isConnecting: false,
        error: null,
      });
      return address;
    } catch (err: any) {
      setWalletState(prev => ({ ...prev, isConnecting: false, error: err.message || 'Failed to connect EVM wallet' }));
      return null;
    }
  };

  const connectSolana = async () => {
    try {
      setWalletState(prev => ({ ...prev, isConnecting: true, error: null }));
      
      // Check for Phantom Provider
      const { solana } = window as any;
      if (!solana || !solana.isPhantom) {
        throw new Error('Phantom wallet is not installed!');
      }

      const response = await solana.connect();
      const address = response.publicKey.toString();

      setWalletState({
        address,
        type: 'solana',
        isConnected: true,
        isConnecting: false,
        error: null,
      });
      return address;
    } catch (err: any) {
      setWalletState(prev => ({ ...prev, isConnecting: false, error: err.message || 'Failed to connect Solana wallet' }));
      return null;
    }
  };

  const disconnect = useCallback(() => {
    // Explicitly clear all non-Stellar wallet states from the context/state
    setWalletState({
      address: null,
      type: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    });
  }, []);

  const signMessage = async (message: string): Promise<string | null> => {
    try {
      if (!walletState.isConnected || !walletState.address || !walletState.type) {
        throw new Error('No wallet connected');
      }

      if (walletState.type === 'evm') {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        // EIP-191 personal_sign handled automatically by ethers.js signMessage
        const signature = await signer.signMessage(message);
        return signature;
      }

      if (walletState.type === 'solana') {
        const { solana } = window as any;
        const encodedMessage = new TextEncoder().encode(message);
        
        // window.solana.signMessage returns { signature, publicKey }
        const signedMessage = await solana.signMessage(encodedMessage, 'utf8');
        
        // Convert Uint8Array signature to Hex string
        const hexSignature = Array.from(signedMessage.signature)
          .map((b: any) => b.toString(16).padStart(2, '0'))
          .join('');
          
        return hexSignature;
      }

      return null;
    } catch (err: any) {
      setWalletState(prev => ({ ...prev, error: err.message || 'Message signing failed or was rejected by the user' }));
      return null;
    }
  };

  return {
    ...walletState,
    connectEVM,
    connectSolana,
    disconnect,
    signMessage,
  };
};
