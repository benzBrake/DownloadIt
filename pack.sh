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
ariang_repository="mayswind/AriaNg"
ariang_version="1.3.14"
ariang_release_name="AriaNg-1.3.14-AllInOne.zip"
ariang_archive_size=701921
ariang_archive_hash="65bc5ed3573ef05313ea953a5c5363c8b33a4996849b2986c78660eab1a9edb2"
ariang_index_size=2321502
ariang_index_hash="ca2b51e09757159a4664b41423d5a8edb1c539e1a4700f568bfa1588bd896646"
ariang_license_size=1097
ariang_license_hash="cbfd5dc92e3fd24a52362a439a12f4584868bbb5bb28faaed37abd2d972fc9d7"
ariang_directory="${addon_directory}/ariang"
ariang_index_path="${ariang_directory}/index.html"
ariang_license_path="${addon_directory}/licenses/ariang-LICENSE"
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
    "ariang/index.html"
    "ariang/manifest.json"
    "licenses/aria2-next-COPYING"
    "licenses/ariang-LICENSE"
    "chrome/content/DownloadItBinaryMetadata.sys.mjs"
    "chrome/content/DownloadItAriaNg.sys.mjs"
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

download_and_verify_ariang() {
    local archive_path="${temporary_directory}/${ariang_release_name}"
    local archive_entries_path="${temporary_directory}/ariang-archive-entries.txt"
    local temporary_index_path="${temporary_directory}/ariang-index.html"
    local temporary_license_path="${temporary_directory}/ariang-LICENSE"
    local archive_actual_size
    local archive_hash_output
    local archive_actual_hash
    local index_actual_size
    local index_hash_output
    local index_actual_hash
    local license_actual_size
    local license_hash_output
    local license_actual_hash
    local index_entry_count=0
    local license_entry_count=0
    local entry
    local github_cli
    local -a archive_entries=()

    if [[ ! -f "${ariang_index_path}" ]]; then
        if command -v ghp > /dev/null 2>&1; then
            github_cli="ghp"
        elif command -v gh > /dev/null 2>&1; then
            github_cli="gh"
        else
            die "GitHub CLI is required to download the pinned AriaNg release asset"
        fi
        printf '[INFO] %s not found locally; downloading pinned AriaNg %s asset\n' "${ariang_release_name}" "${ariang_version}"
        if ! "${github_cli}" release download "${ariang_version}" \
            --repo "${ariang_repository}" \
            --pattern "${ariang_release_name}" \
            --output "${archive_path}" \
            --clobber; then
            die "Unable to download the pinned AriaNg release asset"
        fi

        if ! archive_actual_size="$(stat -c '%s' "${archive_path}")"; then
            die "Unable to read the size of ${archive_path}"
        fi
        if [[ "${archive_actual_size}" != "${ariang_archive_size}" ]]; then
            die "AriaNg archive has invalid size: ${archive_path} (expected ${ariang_archive_size}, got ${archive_actual_size})"
        fi
        if ! archive_hash_output="$(sha256sum "${archive_path}")"; then
            die "Unable to calculate the SHA-256 hash of ${archive_path}"
        fi
        archive_actual_hash="${archive_hash_output%% *}"
        if [[ "${archive_actual_hash}" != "${ariang_archive_hash}" ]]; then
            die "AriaNg archive has invalid SHA-256: ${archive_path}"
        fi

        if ! unzip -Z1 "${archive_path}" \
            | sed -e 's/\r$//' -e 's#^\./##' \
            > "${archive_entries_path}"; then
            die "Unable to inspect the AriaNg archive"
        fi
        mapfile -t archive_entries < "${archive_entries_path}"
        if [[ "${#archive_entries[@]}" -ne 2 ]]; then
            die "The AriaNg archive must contain only index.html and LICENSE at its root"
        fi
        for entry in "${archive_entries[@]}"; do
            case "${entry}" in
                index.html)
                    index_entry_count=$((index_entry_count + 1))
                    ;;
                LICENSE)
                    license_entry_count=$((license_entry_count + 1))
                    ;;
                *)
                    die "The AriaNg archive contains an unexpected entry: ${entry}"
                    ;;
            esac
        done
        if [[ "${index_entry_count}" -ne 1 || "${license_entry_count}" -ne 1 ]]; then
            die "The AriaNg archive must contain one index.html and one LICENSE"
        fi

        if ! unzip -p "${archive_path}" "index.html" > "${temporary_index_path}"; then
            die "Unable to extract index.html from the AriaNg archive"
        fi
        if ! unzip -p "${archive_path}" "LICENSE" > "${temporary_license_path}"; then
            die "Unable to extract LICENSE from the AriaNg archive"
        fi

        if ! license_actual_size="$(stat -c '%s' "${temporary_license_path}")"; then
            die "Unable to read the extracted AriaNg license size"
        fi
        if ! license_hash_output="$(sha256sum "${temporary_license_path}")"; then
            die "Unable to calculate the extracted AriaNg license SHA-256"
        fi
        license_actual_hash="${license_hash_output%% *}"
        if [[ "${license_actual_size}" != "${ariang_license_size}" || "${license_actual_hash}" != "${ariang_license_hash}" ]]; then
            die "AriaNg archive LICENSE failed integrity verification"
        fi

        mkdir -p -- "${ariang_directory}"
        mv -- "${temporary_index_path}" "${ariang_index_path}"
        printf '[OK] Extracted %s\n' "${ariang_index_path}"
    fi

    if ! index_actual_size="$(stat -c '%s' "${ariang_index_path}")"; then
        die "Unable to read the size of ${ariang_index_path}"
    fi
    if [[ "${index_actual_size}" != "${ariang_index_size}" ]]; then
        die "AriaNg index has invalid size: ${ariang_index_path} (expected ${ariang_index_size}, got ${index_actual_size})"
    fi
    if ! index_hash_output="$(sha256sum "${ariang_index_path}")"; then
        die "Unable to calculate the SHA-256 hash of ${ariang_index_path}"
    fi
    index_actual_hash="${index_hash_output%% *}"
    if [[ "${index_actual_hash}" != "${ariang_index_hash}" ]]; then
        die "AriaNg index has invalid SHA-256: ${ariang_index_path}"
    fi

    if ! license_actual_size="$(stat -c '%s' "${ariang_license_path}")"; then
        die "Unable to read the size of ${ariang_license_path}"
    fi
    if ! license_hash_output="$(sha256sum "${ariang_license_path}")"; then
        die "Unable to calculate the SHA-256 hash of ${ariang_license_path}"
    fi
    license_actual_hash="${license_hash_output%% *}"
    if [[ "${license_actual_size}" != "${ariang_license_size}" || "${license_actual_hash}" != "${ariang_license_hash}" ]]; then
        die "Bundled AriaNg license failed integrity verification: ${ariang_license_path}"
    fi

    printf '[INFO] AriaNg index size: %s bytes\n' "${index_actual_size}"
    printf '[INFO] AriaNg index SHA-256: %s\n' "${index_actual_hash}"
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

download_and_verify_ariang

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
