# Hostinger KVM + SeaBIOS (legacy BIOS) — boot, initrd, console.
# Refs: disko example/gpt-bios-compat.nix, NixOS wiki GNU GRUB (legacy BIOS).
{ lib, ... }:
{
  # SeaBIOS — no UEFI vars, no systemd-boot.
  boot.loader.systemd-boot.enable = lib.mkForce false;

  # Virtio disk/NIC for QEMU/KVM (Hostinger VPS).
  boot.initrd.availableKernelModules = lib.mkAfter [
    "virtio_net"
    "virtio_blk"
    "virtio_pci"
    "virtio_scsi"
  ];

  # KVM serial + VGA — visible in hPanel console if kernel panics.
  boot.kernelParams = lib.mkAfter [
    "console=tty0"
    "console=ttyS0,115200n8"
  ];
}
