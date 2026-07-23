#!/usr/bin/env bash
set -euo pipefail

# Package DownloadIt as an XPI on Linux.

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
addon_directory="${script_directory}/addon"
flashgot_path="${addon_directory}/FlashGot.exe"
xpi_path="${script_directory}/addon.xpi"
temporary_root="${script_directory}/.tmp"
temporary_directory=""
temporary_archive_path=""
binary_metadata_path="${addon_directory}/chrome/content/DownloadItBinaryMetadata.sys.mjs"
generated_metadata_created=false
release_repository_path="/benzBrake/Grabby-FlashGot"
release_latest_url="https://github.com${release_repository_path}/releases/latest"

required_entries=(
    "bootstrap.js"
    "install.rdf"
    "chrome.manifest"
    "FlashGot.exe"
    "chrome/content/DownloadItBinaryMetadata.sys.mjs"
    "chrome/content/DownloadItDownloaders.sys.mjs"
    "chrome/content/DownloadItPanelView.sys.mjs"
    "chrome/content/locales/en-US/downloadit.ftl"
    "chrome/content/locales/zh-CN/downloadit.ftl"
)

die() {
    printf '[ERROR] Failed to package DownloadIt: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    local exit_status="$1"

    trap - EXIT
    if [[ "${generated_metadata_created}" == true && -f "${binary_metadata_path}" ]]; then
        rm -f -- "${binary_metadata_path}" || true
    fi
    if [[ -n "${temporary_directory}" && -d "${temporary_directory}" ]]; then
        rm -rf -- "${temporary_directory}" || true
    fi
    exit "${exit_status}"
}

require_command() {
    local command_name="$1"

    if ! command -v "${command_name}" > /dev/null 2>&1; then
        die "Required command is not installed: ${command_name}"
    fi
}

fetch_html() {
    local url="$1"
    local destination="$2"
    local description="$3"
    local http_status

    if ! http_status="$({
        curl \
            --connect-timeout 20 \
            --location \
            --max-time 60 \
            --silent \
            --show-error \
            --user-agent "DownloadIt-pack" \
            --output "${destination}" \
            --write-out '%{http_code}' \
            "${url}"
    })"; then
        die "Unable to fetch ${description}: ${url}"
    fi

    if [[ "${http_status}" == "404" ]]; then
        die "No published Grabby-FlashGot release was found; provide addon/FlashGot.exe locally"
    fi
    if [[ ! "${http_status}" =~ ^2[0-9][0-9]$ ]]; then
        die "Unable to fetch ${description}: HTTP ${http_status}"
    fi
}

download_latest_flashgot() {
    local release_page_path="${temporary_directory}/release.html"
    local assets_page_path="${temporary_directory}/assets.html"
    local release_archive_path="${temporary_directory}/FlashGot-release.zip"
    local release_archive_entries_path="${temporary_directory}/release-archive-entries.txt"
    local release_extract_directory="${temporary_directory}/FlashGot-release"
    local expanded_assets_path
    local asset_download_path
    local expanded_assets_url
    local asset_download_url

    printf '[INFO] FlashGot.exe not found locally; downloading the latest published release\n'
    fetch_html "${release_latest_url}" "${release_page_path}" "the latest release page"

    expanded_assets_path="$(
        grep -m 1 -oE "${release_repository_path}/releases/expanded_assets/[^\"[:space:]<>]+" \
            "${release_page_path}" | sed -n '1p' || true
    )"
    expanded_assets_path="${expanded_assets_path//&amp;/&}"
    if [[ -z "${expanded_assets_path}" ]]; then
        die "The latest release page does not contain an expanded-assets link"
    fi

    expanded_assets_url="https://github.com${expanded_assets_path}"
    fetch_html "${expanded_assets_url}" "${assets_page_path}" "the release assets page"

    asset_download_path="$(
        grep -m 1 -oE "${release_repository_path}/releases/download/[^\"[:space:]<>]+/FlashGot-v[^/\"[:space:]<>]+\\.zip" \
            "${assets_page_path}" | sed -n '1p' || true
    )"
    asset_download_path="${asset_download_path//&amp;/&}"
    if [[ -z "${asset_download_path}" ]]; then
        die "The latest release has no FlashGot-v*.zip asset"
    fi

    asset_download_url="https://github.com${asset_download_path}"
    if ! curl \
        --connect-timeout 20 \
        --fail \
        --location \
        --max-time 300 \
        --silent \
        --show-error \
        --user-agent "DownloadIt-pack" \
        --output "${release_archive_path}" \
        "${asset_download_url}"; then
        die "Unable to download the latest release asset: ${asset_download_url}"
    fi

    if ! unzip -Z1 "${release_archive_path}" \
        | sed -e 's/\r$//' -e 's#^\./##' \
        > "${release_archive_entries_path}"; then
        die "Unable to inspect the downloaded release archive"
    fi
    if ! grep -Fxq "FlashGot.exe" "${release_archive_entries_path}"; then
        die "The release archive does not contain FlashGot.exe at its root"
    fi

    mkdir -p -- "${release_extract_directory}"
    if ! unzip -oq "${release_archive_path}" "FlashGot.exe" -d "${release_extract_directory}"; then
        die "Unable to extract FlashGot.exe from the release archive"
    fi
    if [[ ! -s "${release_extract_directory}/FlashGot.exe" ]]; then
        die "The downloaded FlashGot.exe is missing or empty"
    fi

    cp -- "${release_extract_directory}/FlashGot.exe" "${flashgot_path}"
    printf '[OK] Downloaded %s\n' "${flashgot_path}"
}

for command_name in curl grep mktemp sed sha256sum stat unzip zip; do
    require_command "${command_name}"
done

if [[ ! -d "${addon_directory}" ]]; then
    die "Add-on directory does not exist: ${addon_directory}"
fi

mkdir -p -- "${temporary_root}"
temporary_directory="$(mktemp -d "${temporary_root}/pack.XXXXXXXX")"
temporary_archive_path="${temporary_directory}/addon.xpi"
trap 'cleanup "$?"' EXIT

if [[ ! -f "${flashgot_path}" ]]; then
    download_latest_flashgot
fi
if [[ ! -s "${flashgot_path}" ]]; then
    die "FlashGot.exe is empty: ${flashgot_path}"
fi

if ! flashgot_size="$(stat -c '%s' "${flashgot_path}")"; then
    die "Unable to read the size of ${flashgot_path}"
fi
if ! flashgot_hash_output="$(sha256sum "${flashgot_path}")"; then
    die "Unable to calculate the SHA-256 hash of ${flashgot_path}"
fi
flashgot_hash="${flashgot_hash_output%% *}"
if [[ ! "${flashgot_hash}" =~ ^[0-9a-f]{64}$ ]]; then
    die "Unable to calculate a valid SHA-256 hash for ${flashgot_path}"
fi

printf '[INFO] FlashGot.exe size: %s bytes\n' "${flashgot_size}"
printf '[INFO] FlashGot.exe SHA-256: %s\n' "${flashgot_hash}"

if [[ -e "${binary_metadata_path}" ]]; then
    die "Generated binary metadata file already exists: ${binary_metadata_path}"
fi

generated_metadata_created=true
printf '%s\n' \
    '// Generated by pack.sh. Do not edit this file directly.' \
    "export const BINARY_SIZE = ${flashgot_size};" \
    "export const BINARY_SHA256 = \"${flashgot_hash}\";" \
    > "${binary_metadata_path}"

if ! (
    shopt -s dotglob nullglob
    cd -- "${addon_directory}"
    archive_sources=(*)
    zip -q -r "${temporary_archive_path}" "${archive_sources[@]}"
); then
    die "Unable to create the XPI archive"
fi

archive_entries_path="${temporary_directory}/archive-entries.txt"
if ! unzip -Z1 "${temporary_archive_path}" \
    | sed -e 's/\r$//' -e 's#^\./##' \
    > "${archive_entries_path}"; then
    die "Unable to inspect the generated XPI"
fi
if [[ ! -s "${archive_entries_path}" ]]; then
    die "The generated XPI is empty"
fi

for required_entry in "${required_entries[@]}"; do
    if ! grep -Fxq "${required_entry}" "${archive_entries_path}"; then
        die "The generated XPI is missing required entry: ${required_entry}"
    fi
done

mv -f -- "${temporary_archive_path}" "${xpi_path}"
printf '[OK] Created %s\n' "${xpi_path}"
