# Boot loader — Hostinger KVM uses SeaBIOS (legacy BIOS), not UEFI.
# GRUB search --fs-uuid on a separate /boot partition hangs pre-kernel; use / on root.
{ lib, ... }:
{
  boot.loader.grub = {
    enable = lib.mkDefault true;
    devices = lib.mkForce [ "/dev/sda" ];
    efiSupport = lib.mkDefault false;
    copyKernels = lib.mkDefault true;
    gfxmodeBios = lib.mkDefault "text";
    # Match store-gc.nix — only last 3 system generations in boot menu.
    configurationLimit = lib.mkDefault 3;
  };
  boot.loader.systemd-boot.enable = lib.mkDefault false;
}
