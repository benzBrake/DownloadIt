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
aria2next_repository="AnInsomniacy/aria2-next"
aria2next_version="2.5.5"
aria2next_windows_name="aria2-next.exe"
aria2next_windows_release_name="aria2-next-2.5.5-windows-x86_64.exe"
aria2next_windows_size=4555264
aria2next_windows_hash="554f2f81ca53731dc9e01710cfb16081a34759f3276ff16eb4b12656c1b6e5b9"
aria2next_linux_name="aria2-next-linux-x86_64"
aria2next_linux_release_name="aria2-next-2.5.5-linux-x86_64"
aria2next_linux_size=3852672
aria2next_linux_hash="b6f2cdadcd34ba16dd7fcb29de4b84c36f893f9b223a9a05157d1892687a45a0"
nightly_repository="benzBrake/Grabby-FlashGot"
nightly_workflow="nightly.yml"
nightly_branch="master"
nightly_artifact="FlashGot-nightly"
nightly_link_url="https://nightly.link/benzBrake/Grabby-FlashGot/workflows/nightly.yml/master/FlashGot-nightly.zip"
github_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

required_entries=(
    "bootstrap.js"
    "install.rdf"
    "chrome.manifest"
    "FlashGot.exe"
    "aria2-next.exe"
    "aria2-next-linux-x86_64"
    "licenses/aria2-next-COPYING"
    "chrome/content/DownloadItBinaryMetadata.sys.mjs"
    "chrome/content/DownloadItDownloaders.sys.mjs"
    "chrome/content/DownloadItGitHubMirror.sys.mjs"
    "chrome/content/DownloadItIDMBridge.sys.mjs"
    "chrome/content/DownloadItIDMProtocol.sys.mjs"
    "chrome/content/DownloadItLinks.sys.mjs"
    "chrome/content/DownloadItMirrors.sys.mjs"
    "chrome/content/DownloadItPanelView.sys.mjs"
    "chrome/content/icons/downloadit.svg"
    "chrome/content/panel.css"
    "chrome/content/links.xhtml"
    "chrome/content/links.js"
    "chrome/content/links.css"
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

download_file() {
    local url="$1"
    local destination="$2"
    local description="$3"
    shift 3

    if ! curl \
        --connect-timeout 20 \
        --fail \
        --location \
        --max-time 300 \
        --silent \
        --show-error \
        --user-agent "DownloadIt-pack" \
        "$@" \
        --output "${destination}" \
        "${url}"; then
        die "Unable to download ${description}: ${url}"
    fi
}

download_nightly_from_github_api() {
    local archive_path="$1"
    local workflow_runs_path="${temporary_directory}/workflow-runs.json"
    local artifacts_path="${temporary_directory}/artifacts.json"
    local workflow_runs_url
    local artifacts_url
    local latest_run_id
    local artifact_download_url

    require_command jq

    workflow_runs_url="https://api.github.com/repos/${nightly_repository}/actions/workflows/${nightly_workflow}/runs?branch=${nightly_branch}&status=success&per_page=1"
    download_file \
        "${workflow_runs_url}" \
        "${workflow_runs_path}" \
        "the latest successful nightly workflow run" \
        --header "Accept: application/vnd.github+json" \
        --header "Authorization: Bearer ${github_token}" \
        --header "X-GitHub-Api-Version: 2022-11-28"

    if ! latest_run_id="$(jq -er '.workflow_runs[0].id // empty' "${workflow_runs_path}")"; then
        die "No successful nightly build was found in ${nightly_repository}"
    fi
    if [[ ! "${latest_run_id}" =~ ^[0-9]+$ ]]; then
        die "The latest nightly workflow run has an invalid ID"
    fi

    artifacts_url="https://api.github.com/repos/${nightly_repository}/actions/runs/${latest_run_id}/artifacts?per_page=100"
    download_file \
        "${artifacts_url}" \
        "${artifacts_path}" \
        "the latest nightly workflow artifacts" \
        --header "Accept: application/vnd.github+json" \
        --header "Authorization: Bearer ${github_token}" \
        --header "X-GitHub-Api-Version: 2022-11-28"

    if ! artifact_download_url="$(
        jq -er \
            --arg artifact "${nightly_artifact}" \
            '[.artifacts[] | select(.name == $artifact and .expired == false)][0].archive_download_url // empty' \
            "${artifacts_path}"
    )"; then
        die "The latest successful nightly run has no available ${nightly_artifact} artifact"
    fi

    download_file \
        "${artifact_download_url}" \
        "${archive_path}" \
        "the latest nightly artifact" \
        --header "Accept: application/vnd.github+json" \
        --header "Authorization: Bearer ${github_token}" \
        --header "X-GitHub-Api-Version: 2022-11-28"
}

download_latest_flashgot() {
    local nightly_archive_path="${temporary_directory}/${nightly_artifact}.zip"
    local nightly_archive_entries_path="${temporary_directory}/nightly-archive-entries.txt"
    local nightly_extract_directory="${temporary_directory}/${nightly_artifact}"

    if [[ -n "${github_token}" ]]; then
        printf '[INFO] FlashGot.exe not found locally; downloading the latest nightly build through the GitHub API\n'
        download_nightly_from_github_api "${nightly_archive_path}"
    else
        printf '[INFO] FlashGot.exe not found locally; downloading the latest nightly build from nightly.link\n'
        download_file \
            "${nightly_link_url}" \
            "${nightly_archive_path}" \
            "the latest nightly artifact"
    fi

    if ! unzip -Z1 "${nightly_archive_path}" \
        | sed -e 's/\r$//' -e 's#^\./##' \
        > "${nightly_archive_entries_path}"; then
        die "Unable to inspect the downloaded nightly archive"
    fi
    if ! grep -Fxq "FlashGot.exe" "${nightly_archive_entries_path}"; then
        die "The nightly archive does not contain FlashGot.exe at its root"
    fi

    mkdir -p -- "${nightly_extract_directory}"
    if ! unzip -oq "${nightly_archive_path}" "FlashGot.exe" -d "${nightly_extract_directory}"; then
        die "Unable to extract FlashGot.exe from the nightly archive"
    fi
    if [[ ! -s "${nightly_extract_directory}/FlashGot.exe" ]]; then
        die "The downloaded FlashGot.exe is missing or empty"
    fi

    cp -- "${nightly_extract_directory}/FlashGot.exe" "${flashgot_path}"
    printf '[OK] Downloaded %s\n' "${flashgot_path}"
}

download_and_verify_aria2next_asset() {
    local resource_name="$1"
    local release_name="$2"
    local expected_size="$3"
    local expected_hash="$4"
    local resource_path="${addon_directory}/${resource_name}"
    local download_url="https://github.com/${aria2next_repository}/releases/download/v${aria2next_version}/${release_name}"
    local actual_size
    local hash_output
    local actual_hash

    if [[ ! -f "${resource_path}" ]]; then
        printf '[INFO] %s not found locally; downloading pinned Aria2Next v%s asset\n' "${release_name}" "${aria2next_version}"
        download_file "${download_url}" "${resource_path}" "${release_name}"
        printf '[OK] Downloaded %s\n' "${resource_path}"
    fi
    if ! actual_size="$(stat -c '%s' "${resource_path}")"; then
        die "Unable to read the size of ${resource_path}"
    fi
    if [[ "${actual_size}" != "${expected_size}" ]]; then
        die "Aria2Next asset has invalid size: ${resource_path} (expected ${expected_size}, got ${actual_size})"
    fi
    if ! hash_output="$(sha256sum "${resource_path}")"; then
        die "Unable to calculate the SHA-256 hash of ${resource_path}"
    fi
    actual_hash="${hash_output%% *}"
    if [[ "${actual_hash}" != "${expected_hash}" ]]; then
        die "Aria2Next asset has invalid SHA-256: ${resource_path}"
    fi
    printf '[INFO] %s size: %s bytes\n' "${resource_name}" "${actual_size}"
    printf '[INFO] %s SHA-256: %s\n' "${resource_name}" "${actual_hash}"
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

download_and_verify_aria2next_asset \
    "${aria2next_windows_name}" \
    "${aria2next_windows_release_name}" \
    "${aria2next_windows_size}" \
    "${aria2next_windows_hash}"
download_and_verify_aria2next_asset \
    "${aria2next_linux_name}" \
    "${aria2next_linux_release_name}" \
    "${aria2next_linux_size}" \
    "${aria2next_linux_hash}"

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
    'export const ARIA2NEXT_BINARY_METADATA = Object.freeze({' \
    "  windows: Object.freeze({ resourceName: \"${aria2next_windows_name}\", profileName: \"aria2-next.exe\", size: ${aria2next_windows_size}, sha256: \"${aria2next_windows_hash}\" })," \
    "  \"linux-x86_64\": Object.freeze({ resourceName: \"${aria2next_linux_name}\", profileName: \"aria2-next\", size: ${aria2next_linux_size}, sha256: \"${aria2next_linux_hash}\" })," \
    '});' \
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
