# GeoSyntra Hostinger VPS — SeaBIOS / NixOS checklist

Hostinger KVM uses **SeaBIOS (legacy BIOS)**, not UEFI. Console shows `Press ESC for boot menu` and `iPXE`.

## Verified facts (this VPS)

| Item | Value |
|------|--------|
| IP | `2.24.11.216` |
| Disk | `/dev/sda` 50G, virtio-scsi |
| Firmware | SeaBIOS — `/sys/firmware/efi` absent on Ubuntu |
| Install tool | `nixos-anywhere` via `geosyntra-deploy nixos install --confirm` |

## Boot failures we hit (and fixes)

| Symptom | Cause | Fix in flake |
|---------|--------|--------------|
| Empty boot menu after reboot | `systemd-boot` on SeaBIOS | `boot.loader.systemd-boot.enable = false` |
| GRUB editor, vfat UUID search | Separate vfat EF00 `/boot` + `efiSupport = true` | `efiSupport = false`, no vfat boot partition |
| GRUB editor, ext4 UUID search | Separate ext4 `/boot` partition — `search --fs-uuid` fails on SeaBIOS | **Single ext4 `/`** — `/boot` on root ([disko gpt-bios-compat](https://github.com/nix-community/disko/blob/master/example/gpt-bios-compat.nix)) |
| SSH timeout after “Done!” | No root `authorizedKeys` in NixOS config | `secrets/vps-deploy-key.pub` + `--extra-files` + `--copy-host-keys` |
| Local install ENOSPC | Full closure built on laptop | `--build-on-remote` (auto when `/nix` &lt; 20 GiB) |

## Required NixOS layout (current)

```
GPT /dev/sda
├── EF02  1M   bios_grub (GRUB embed)
└── ext4  100% /            (/boot is /boot on root)
```

**GRUB:** `devices = [ "/dev/sda" ]`, `efiSupport = false`, `copyKernels = true`

**Not used on SeaBIOS:** systemd-boot, EF00 vfat ESP, `efiInstallAsRemovable`

## Module map

| File | Role |
|------|------|
| `disko.nix` | EF02 + single ext4 root |
| `boot.nix` | GRUB BIOS-only |
| `seabios.nix` | virtio initrd modules, serial console |
| `networking.nix` | DHCP, openssh, deploy key |
| `hardware.nix` | qemu-guest profile (regenerated on install) |

## Install command

```bash
export GEOSYNTRA_DEPLOY_HOST=2.24.11.216
geosyntra-deploy backup pull && geosyntra-deploy backup restore
GEOSYNTRA_NIXOS_BUILD_ON_REMOTE=1 geosyntra-deploy nixos install --confirm
```

Optional first boot without GeoSyntra services: `GEOSYNTRA_NIXOS_MINIMAL=1`

## Post-install

1. SSH: `ssh -i ~/.ssh/id_ed25519_geosyntra_vps root@2.24.11.216`
2. Restore: `migration/vps-backup/restore-ready/RESTORE.md`
3. Deploy: `geosyntra-deploy nixos switch`

## References

- [NixOS wiki — GNU GRUB (legacy BIOS)](https://wiki.nixos.org/wiki/GNU_GRUB)
- [disko gpt-bios-compat.nix](https://github.com/nix-community/disko/blob/master/example/gpt-bios-compat.nix)
- [nixos-anywhere reference](https://nix-community.github.io/nixos-anywhere/reference.html)
