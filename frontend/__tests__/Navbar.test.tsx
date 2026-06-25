import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock WalletContext so Navbar renders without Stellar SDK calls
jest.mock("../src/context/WalletContext", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWallet: () => ({
    publicKey: null,
    isConnected: false,
    usdcBalance: null,
    network: null,
    wrongNetwork: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

// next/font is not available in jest env
jest.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "inter" }),
}));

import Navbar from "../src/components/Navbar";

describe("Navbar – mobile menu", () => {
  it("renders without crashing and shows logo", () => {
    render(<Navbar />);
    expect(screen.getByText("Mortgage")).toBeInTheDocument();
  });

  it("mobile drawer is hidden by default", () => {
    render(<Navbar />);
    const drawer = document.getElementById("mobile-menu");
    expect(drawer).toHaveClass("translate-x-full");
  });

  it("opens the mobile drawer when hamburger is clicked", () => {
    render(<Navbar />);
    const btn = screen.getByRole("button", { name: /open menu/i });
    fireEvent.click(btn);
    const drawer = document.getElementById("mobile-menu");
    expect(drawer).toHaveClass("translate-x-0");
    // button label changes to close
    expect(screen.getByRole("button", { name: /close menu/i })).toBeInTheDocument();
  });

  it("closes the mobile drawer when close button is clicked", () => {
    render(<Navbar />);
    // open first
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    // then close
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    const drawer = document.getElementById("mobile-menu");
    expect(drawer).toHaveClass("translate-x-full");
  });

  it("closes the drawer when the overlay is clicked", () => {
    render(<Navbar />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    // overlay has aria-hidden and no role — select by class
    const overlay = document.querySelector(".bg-black\\/50");
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    const drawer = document.getElementById("mobile-menu");
    expect(drawer).toHaveClass("translate-x-full");
  });

  it("closes the drawer when a nav link is clicked", () => {
    render(<Navbar />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    // Click "Dashboard" link inside the drawer
    const links = screen.getAllByRole("link", { name: "Dashboard" });
    // The drawer one is the second (desktop is first, or there may only be one in mobile)
    fireEvent.click(links[links.length - 1]);
    const drawer = document.getElementById("mobile-menu");
    expect(drawer).toHaveClass("translate-x-full");
  });

  it("shows Connect Wallet button when not connected", () => {
    render(<Navbar />);
    expect(screen.getAllByRole("button", { name: /connect wallet/i }).length).toBeGreaterThan(0);
  });
});
