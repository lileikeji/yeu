#!/usr/bin/env python3
"""Parse an AMap Work Map workbook and generate auditable import artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import warnings
from collections import Counter
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zipfile import ZipFile

from openpyxl import load_workbook


AMAP_CRS_SOURCE = "https://lbs.amap.com/faq/advisory/others/39838"
CAMPUS_BOUNDS = {
    "minLng": 118.58,
    "maxLng": 118.63,
    "minLat": 25.09,
    "maxLat": 25.14,
}
COORDINATE_HEADERS = {
    "lng",
    "lon",
    "longitude",
    "经度",
    "lat",
    "latitude",
    "纬度",
    "坐标",
}
LOCATION_CODE_PREFIX = "位置编码"
LOCATION_CODE_RE = re.compile(r"^WIA-(?P<map>\d+[.]\d+),(?P<resource>\d+[.]\d+)$")
CONVERSION_METHOD = "gcj02-to-wgs84-iterative-v1"
CREATOR_HEADER_SUFFIX = "创建人"
CONVERSION_TOLERANCE_DEGREES = 1e-7
SEED_COORDINATE_PRECISION = 8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="AMap Work Map .xlsx export")
    parser.add_argument(
        "--raw-output",
        type=Path,
        default=Path("data/imports/amap-workmap-2026-07-13.raw.json"),
    )
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=Path("data/imports/amap-workmap-2026-07-13.audit.json"),
    )
    parser.add_argument(
        "--coordinates",
        type=Path,
        help="JSON array with locationCode, lng, lat and crs for seed generation",
    )
    parser.add_argument(
        "--coordinate-template-output",
        type=Path,
        default=Path("data/imports/amap-workmap-2026-07-13.coordinates.template.json"),
    )
    parser.add_argument(
        "--seed-output",
        type=Path,
        default=Path("data/seeds/amap-imported-places.ts"),
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="explicitly process only the first N marker rows; defaults to all markers",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and print the audit without writing files",
    )
    return parser.parse_args()


def json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, (date, time)):
        return value.isoformat()
    return value


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unique_headers(values: list[Any]) -> list[str]:
    headers: list[str] = []
    counts: Counter[str] = Counter()
    for index, value in enumerate(values, start=1):
        base = str(value).strip() if value not in (None, "") else f"_column_{index}"
        counts[base] += 1
        headers.append(base if counts[base] == 1 else f"{base}__{counts[base]}")
    return headers


def parse_workbook(path: Path) -> dict[str, Any]:
    warnings.filterwarnings("ignore", message="Workbook contains no default style")
    workbook = load_workbook(path, read_only=False, data_only=False)
    sheets: list[dict[str, Any]] = []
    redacted_creator_cells = 0

    for sheet in workbook.worksheets:
        headers = unique_headers(
            [sheet.cell(1, column).value for column in range(1, sheet.max_column + 1)]
        )
        rows: list[dict[str, Any]] = []
        for row_number in range(2, sheet.max_row + 1):
            values = [
                json_value(sheet.cell(row_number, column).value)
                for column in range(1, sheet.max_column + 1)
            ]
            if not any(value not in (None, "") for value in values):
                continue
            for index, header in enumerate(headers):
                if header.endswith(CREATOR_HEADER_SUFFIX) and values[index] not in (None, ""):
                    values[index] = None
                    redacted_creator_cells += 1
            rows.append(
                {
                    "_sourceRow": row_number,
                    **dict(zip(headers, values, strict=True)),
                }
            )

        sheets.append(
            {
                "name": sheet.title,
                "state": sheet.sheet_state,
                "maxRow": sheet.max_row,
                "maxColumn": sheet.max_column,
                "headers": headers,
                "rows": rows,
            }
        )

    media: list[dict[str, Any]] = []
    with ZipFile(path) as archive:
        for name in sorted(item for item in archive.namelist() if item.startswith("xl/media/")):
            payload = archive.read(name)
            media.append(
                {
                    "archivePath": name,
                    "sizeBytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "copiedToRepository": False,
                }
            )

    return {
        "schemaVersion": 1,
        "source": {
            "fileName": path.name,
            "sha256": file_sha256(path),
            "sizeBytes": path.stat().st_size,
            "lastModifiedAt": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
            "provider": "AMap Work Map",
            "ownership": "user-authorized self-owned export",
        },
        "redactions": [
            {
                "fieldSuffix": CREATOR_HEADER_SUFFIX,
                "action": "value removed; column retained",
                "reason": "public repository data minimization",
                "redactedCellCount": redacted_creator_cells,
            }
        ],
        "embeddedMedia": media,
        "sheets": sheets,
    }


def find_header(headers: list[str], prefix: str) -> str | None:
    return next((header for header in headers if header.startswith(prefix)), None)


def build_audit(raw: dict[str, Any], requested_seed_count: int) -> dict[str, Any]:
    marker_sheet = raw["sheets"][0]
    area_sheet = raw["sheets"][1]
    marker_headers = marker_sheet["headers"]
    location_header = find_header(marker_headers, LOCATION_CODE_PREFIX)
    if location_header is None:
        raise ValueError("marker sheet has no AMap location-code column")

    markers = marker_sheet["rows"]
    names = [str(row.get("名称") or "").strip() for row in markers]
    location_codes = [str(row.get(location_header) or "").strip() for row in markers]
    coordinate_headers = [
        header for header in marker_headers if header.strip().lower() in COORDINATE_HEADERS
    ]
    malformed_codes = [code for code in location_codes if not LOCATION_CODE_RE.fullmatch(code)]
    duplicate_names = sorted(name for name, count in Counter(names).items() if name and count > 1)
    duplicate_codes = sorted(
        code for code, count in Counter(location_codes).items() if code and count > 1
    )
    blank_names = [row["_sourceRow"] for row in markers if not str(row.get("名称") or "").strip()]
    blank_codes = [
        row["_sourceRow"] for row in markers if not str(row.get(location_header) or "").strip()
    ]
    formula_count = sum(
        1
        for sheet in raw["sheets"]
        for row in sheet["rows"]
        for key, value in row.items()
        if key != "_sourceRow" and isinstance(value, str) and value.startswith("=")
    )
    photo_header = find_header(marker_headers, "照片[")
    photo_rows = [
        row["_sourceRow"]
        for row in markers
        if photo_header and str(row.get(photo_header) or "").strip()
    ]
    unreviewed_rows = [
        row["_sourceRow"]
        for row in markers
        if not str(row.get("审核结果") or "").strip()
    ]

    mismatch_candidates: list[dict[str, Any]] = []
    for row in markers:
        name = str(row.get("名称") or "")
        address = str(row.get("地址") or "")
        other_buildings = re.findall(r"([\u4e00-\u9fff]{2,8}楼)", address)
        if other_buildings and name not in other_buildings:
            mismatch_candidates.append(
                {
                    "sourceRow": row["_sourceRow"],
                    "name": name,
                    "address": address,
                    "reason": "reverse-geocoded address mentions a different building name",
                }
            )

    area_names = [str(row.get("名称") or "").strip() for row in area_sheet["rows"]]
    duplicate_area_names = {
        name: count for name, count in Counter(area_names).items() if name and count > 1
    }
    return {
        "schemaVersion": 1,
        "sourceSha256": raw["source"]["sha256"],
        "sheetSummary": [
            {
                "name": sheet["name"],
                "headers": sheet["headers"],
                "dataRowCount": len(sheet["rows"]),
                "maxRow": sheet["maxRow"],
                "maxColumn": sheet["maxColumn"],
            }
            for sheet in raw["sheets"]
        ],
        "markerAudit": {
            "rowCount": len(markers),
            "requestedSeedCount": requested_seed_count,
            "defaultSeedSelection": (
                "all marker rows in workbook order"
                if requested_seed_count == len(markers)
                else f"first {requested_seed_count} marker rows in workbook order"
            ),
            "uniqueNameCount": len(set(names)),
            "uniqueLocationCodeCount": len(set(location_codes)),
            "blankNameRows": blank_names,
            "blankLocationCodeRows": blank_codes,
            "duplicateNames": duplicate_names,
            "duplicateLocationCodes": duplicate_codes,
            "malformedLocationCodes": malformed_codes,
            "formulaCellCount": formula_count,
            "rowsWithPhotoLinks": photo_rows,
            "rowsWithoutReviewResult": unreviewed_rows,
            "addressMismatchCandidates": mismatch_candidates,
        },
        "areaAudit": {
            "rowCount": len(area_sheet["rows"]),
            "duplicateNames": duplicate_area_names,
        },
        "coordinateAudit": {
            "coordinateColumns": coordinate_headers,
            "coordinatesPresentInWorkbook": bool(coordinate_headers),
            "exportCoordinateSystem": None,
            "locationCodeInterpretation": (
                "AMap Work Map internal resource identifier; values are sequential and "
                "must not be parsed as longitude/latitude"
            ),
            "providerNativeCoordinateSystem": "GCJ-02",
            "providerCrsSource": AMAP_CRS_SOURCE,
            "seedGenerationBlocked": not coordinate_headers,
            "blockedReason": (
                "The workbook contains no longitude/latitude columns or hidden coordinate "
                "metadata. Supply an authorized locationCode-to-coordinate JSON export."
            ),
        },
        "verificationSemantics": {
            "importedMeans": "present in the user's AMap Work Map export",
            "verifiedMeans": "independently checked against an official or field source",
            "seedMapPoiStatus": "draft",
            "currentRowsAreOfficiallyVerified": False,
        },
        "privacyAudit": {
            "sourceWorkbookStoredInRepository": False,
            "creatorFieldValuesRemoved": True,
            "redactedCreatorCellCount": raw["redactions"][0]["redactedCellCount"],
            "embeddedImagesCopiedToRepository": False,
        },
    }


def out_of_china(lng: float, lat: float) -> bool:
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)


def transform_lat(lng: float, lat: float) -> float:
    value = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat
    value += 0.1 * lng * lat + 0.2 * math.sqrt(abs(lng))
    value += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    value += (20.0 * math.sin(lat * math.pi) + 40.0 * math.sin(lat / 3.0 * math.pi)) * 2.0 / 3.0
    value += (160.0 * math.sin(lat / 12.0 * math.pi) + 320 * math.sin(lat * math.pi / 30.0)) * 2.0 / 3.0
    return value


def transform_lng(lng: float, lat: float) -> float:
    value = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng
    value += 0.1 * lng * lat + 0.1 * math.sqrt(abs(lng))
    value += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    value += (20.0 * math.sin(lng * math.pi) + 40.0 * math.sin(lng / 3.0 * math.pi)) * 2.0 / 3.0
    value += (150.0 * math.sin(lng / 12.0 * math.pi) + 300.0 * math.sin(lng / 30.0 * math.pi)) * 2.0 / 3.0
    return value


def wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    if out_of_china(lng, lat):
        return lng, lat
    earth_radius = 6378245.0
    eccentricity = 0.00669342162296594323
    delta_lat = transform_lat(lng - 105.0, lat - 35.0)
    delta_lng = transform_lng(lng - 105.0, lat - 35.0)
    rad_lat = lat / 180.0 * math.pi
    magic = 1 - eccentricity * math.sin(rad_lat) ** 2
    sqrt_magic = math.sqrt(magic)
    delta_lat = (delta_lat * 180.0) / (
        (earth_radius * (1 - eccentricity)) / (magic * sqrt_magic) * math.pi
    )
    delta_lng = (delta_lng * 180.0) / (
        earth_radius / sqrt_magic * math.cos(rad_lat) * math.pi
    )
    return lng + delta_lng, lat + delta_lat


def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float, int, float]:
    """Iteratively invert the public GCJ-02 forward approximation."""
    if out_of_china(lng, lat):
        return lng, lat, 0, 0.0
    wgs_lng, wgs_lat = lng, lat
    residual = float("inf")
    for iteration in range(1, 11):
        projected_lng, projected_lat = wgs84_to_gcj02(wgs_lng, wgs_lat)
        delta_lng = projected_lng - lng
        delta_lat = projected_lat - lat
        wgs_lng -= delta_lng
        wgs_lat -= delta_lat
        residual = max(abs(delta_lng), abs(delta_lat))
        if residual <= CONVERSION_TOLERANCE_DEGREES:
            return wgs_lng, wgs_lat, iteration, residual
    return wgs_lng, wgs_lat, 10, residual


def category_for(name: str) -> str:
    if "门" in name:
        return "gate"
    if "餐厅" in name:
        return "food"
    if any(token in name for token in ("快递", "京东")):
        return "express"
    if any(token in name for token in ("医务", "信息中心", "保卫处")):
        return "service"
    dorm_names = {
        "长春楼", "长安楼", "宏船楼", "仰光楼", "黄海楼", "东海楼", "曼谷楼",
        "衡山楼", "威海楼", "陕西楼", "吉林楼", "湖南楼", "黑龙江楼", "海南楼",
        "重庆楼", "四川楼", "贵州楼", "渤海楼", "南海楼", "南京楼", "天山楼",
        "安徽楼", "云南楼", "宁夏楼", "辽宁楼", "甘肃楼", "湖北楼", "北京楼", "上海楼",
    }
    if name in dorm_names:
        return "dorm"
    if any(token in name for token in ("洗衣店", "学生街")):
        return "nearby"
    return "campus-building"


def ts_string(value: str) -> str:
    escaped = (
        value.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )
    return f"'{escaped}'"


def load_coordinate_map(path: Path) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("coordinate file must be a JSON array")
    result: dict[str, dict[str, Any]] = {}
    coordinate_owners: dict[tuple[float, float, str], str] = {}
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"coordinate item {index} must be an object")
        code = str(item.get("locationCode") or "").strip()
        if not code or code in result:
            raise ValueError(f"coordinate item {index} has a blank or duplicate locationCode")
        if not LOCATION_CODE_RE.fullmatch(code):
            raise ValueError(f"coordinate item {index} has a malformed locationCode")
        crs = item.get("crs")
        if crs not in {"GCJ-02", "WGS84"}:
            raise ValueError(f"coordinate item {index} has unsupported crs {crs!r}")
        if item.get("lng") is None or item.get("lat") is None:
            raise ValueError(f"coordinate item {index} still has a null lng or lat")
        lng = float(item["lng"])
        lat = float(item["lat"])
        if not (math.isfinite(lng) and math.isfinite(lat)):
            raise ValueError(f"coordinate item {index} has a non-finite lng or lat")
        if not (-180 <= lng <= 180 and -90 <= lat <= 90):
            raise ValueError(f"coordinate item {index} is outside valid longitude/latitude")
        coordinate_source = str(item.get("coordinateSource") or "").strip()
        if not coordinate_source:
            raise ValueError(f"coordinate item {index} has no coordinateSource provenance")
        coordinate_key = (lng, lat, crs)
        if coordinate_key in coordinate_owners:
            raise ValueError(
                f"coordinate item {index} duplicates the point for "
                f"{coordinate_owners[coordinate_key]}"
            )
        coordinate_owners[coordinate_key] = code
        result[code] = {
            "lng": lng,
            "lat": lat,
            "crs": crs,
            "coordinateSource": coordinate_source,
        }
    return result


def validate_selected_markers(
    selected: list[dict[str, Any]], location_header: str
) -> list[str]:
    codes = [str(row.get(location_header) or "").strip() for row in selected]
    blank_rows = [row["_sourceRow"] for row, code in zip(selected, codes, strict=True) if not code]
    if blank_rows:
        raise ValueError(f"selected marker rows have blank location codes: {blank_rows}")
    malformed = [code for code in codes if not LOCATION_CODE_RE.fullmatch(code)]
    if malformed:
        raise ValueError(f"selected marker rows have malformed location codes: {malformed}")
    duplicates = sorted(code for code, count in Counter(codes).items() if count > 1)
    if duplicates:
        raise ValueError(f"selected marker rows have duplicate location codes: {duplicates}")
    return codes


def generate_coordinate_template(raw: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    marker_sheet = raw["sheets"][0]
    location_header = find_header(marker_sheet["headers"], LOCATION_CODE_PREFIX)
    if location_header is None:
        raise ValueError("marker sheet has no AMap location-code column")
    selected = marker_sheet["rows"][:limit]
    if len(selected) != limit:
        raise ValueError(f"requested {limit} markers but workbook only has {len(selected)}")
    validate_selected_markers(selected, location_header)
    return [
        {
            "sourceRow": row["_sourceRow"],
            "name": row["名称"],
            "locationCode": row[location_header],
            "lng": None,
            "lat": None,
            "crs": "GCJ-02",
            "pointRole": None,
            "accuracyMeters": None,
            "coordinateSource": None,
            "coordinateSourceUrl": None,
            "verificationStatus": "pending-authorized-coordinate-export",
            "verifiedAt": None,
            "verifierCategory": None,
        }
        for row in selected
    ]


def generate_seed(raw: dict[str, Any], coordinate_path: Path, limit: int) -> str:
    markers = raw["sheets"][0]
    location_header = find_header(markers["headers"], LOCATION_CODE_PREFIX)
    if location_header is None:
        raise ValueError("marker sheet has no AMap location-code column")
    selected = markers["rows"][:limit]
    if len(selected) != limit:
        raise ValueError(f"requested {limit} markers but workbook only has {len(selected)}")
    selected_codes = validate_selected_markers(selected, location_header)
    coordinate_map = load_coordinate_map(coordinate_path)
    missing = [code for code in selected_codes if code not in coordinate_map]
    if missing:
        raise ValueError(f"coordinate file is missing {len(missing)} selected location codes")

    place_lines: list[str] = []
    audit_lines: list[str] = []
    output_coordinate_owners: dict[tuple[float, float], str] = {}
    for row in selected:
        row_number = int(row["_sourceRow"])
        place_id = f"amap-import-row-{row_number:03d}"
        name = str(row["名称"])
        category = category_for(name)
        code = str(row[location_header])
        original = coordinate_map[code]
        if original["crs"] == "GCJ-02":
            wgs_lng, wgs_lat, iterations, residual = gcj02_to_wgs84(
                original["lng"], original["lat"]
            )
            converted = True
        else:
            wgs_lng, wgs_lat = original["lng"], original["lat"]
            iterations, residual, converted = 0, 0.0, False
        if converted and residual > CONVERSION_TOLERANCE_DEGREES:
            raise ValueError(
                f"{name} (row {row_number}) coordinate conversion did not converge"
            )
        if not (
            CAMPUS_BOUNDS["minLng"] <= wgs_lng <= CAMPUS_BOUNDS["maxLng"]
            and CAMPUS_BOUNDS["minLat"] <= wgs_lat <= CAMPUS_BOUNDS["maxLat"]
        ):
            raise ValueError(f"{name} (row {row_number}) is outside the campus validation bounds")
        output_coordinate = (
            round(wgs_lng, SEED_COORDINATE_PRECISION),
            round(wgs_lat, SEED_COORDINATE_PRECISION),
        )
        if output_coordinate in output_coordinate_owners:
            raise ValueError(
                f"{name} (row {row_number}) duplicates the generated point for "
                f"{output_coordinate_owners[output_coordinate]}"
            )
        output_coordinate_owners[output_coordinate] = name

        place_lines.append(
            "\n".join(
                [
                    "  {",
                    f"    id: {ts_string(place_id)},",
                    f"    name: {ts_string(name)},",
                    f"    category: {ts_string(category)},",
                    f"    point: {{ lng: {wgs_lng:.{SEED_COORDINATE_PRECISION}f}, lat: {wgs_lat:.{SEED_COORDINATE_PRECISION}f}, crs: 'WGS84' }},",
                    "    status: 'draft'",
                    "  }",
                ]
            )
        )
        audit_lines.append(
            "\n".join(
                [
                    f"  {ts_string(place_id)}: {{",
                    f"    sourceRow: {row_number},",
                    f"    locationCode: {ts_string(code)},",
                    f"    coordinateSource: {ts_string(original['coordinateSource'])},",
                    "    importStatus: 'imported',",
                    "    verificationStatus: 'owner-map-only',",
                    f"    originalPoint: {{ lng: {original['lng']:.8f}, lat: {original['lat']:.8f}, crs: {ts_string(original['crs'])} }},",
                    f"    converted: {str(converted).lower()},",
                    f"    conversionMethod: {ts_string(CONVERSION_METHOD if converted else 'none')},",
                    f"    iterations: {iterations},",
                    f"    angularResidualDegrees: {residual:.12g}",
                    "  }",
                ]
            )
        )

    return "\n".join(
        [
            "import type { MapPoi } from '../../map/core/types'",
            "",
            "/**",
            " * User-owned AMap Work Map import. `draft` means imported, not officially verified.",
            " * WGS84 values converted from GCJ-02 are approximate and require field checks.",
            " */",
            "export const amapImportMetadata = {",
            f"  sourceWorkbookSha256: {ts_string(raw['source']['sha256'])},",
            f"  selectedMarkerCount: {limit},",
            f"  selection: {ts_string('all marker rows in workbook order' if limit == len(markers['rows']) else f'first {limit} marker rows in workbook order')},",
            "  importStatus: 'imported',",
            "  verificationStatus: 'owner-map-only',",
            "  mapPoiStatus: 'draft'",
            "} as const",
            "",
            "export const amapImportedPlaces: MapPoi[] = [",
            ",\n".join(place_lines),
            "]",
            "",
            "export const amapImportedPlaceAudit = {",
            ",\n".join(audit_lines),
            "} as const",
            "",
        ]
    )


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> int:
    args = parse_args()
    if not args.workbook.is_file():
        raise FileNotFoundError(args.workbook)
    if args.limit is not None and args.limit <= 0:
        raise ValueError("--limit must be positive")

    raw = parse_workbook(args.workbook)
    marker_count = len(raw["sheets"][0]["rows"])
    selection_limit = args.limit if args.limit is not None else marker_count
    audit = build_audit(raw, selection_limit)
    coordinate_template = generate_coordinate_template(raw, selection_limit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))

    seed_text: str | None = None
    if args.coordinates:
        seed_text = generate_seed(raw, args.coordinates, selection_limit)
    elif not args.dry_run:
        print(
            "seed not generated: workbook has no coordinates; pass --coordinates with an "
            "authorized locationCode mapping",
            file=sys.stderr,
        )

    if args.dry_run:
        return 0

    write_json(args.raw_output, raw)
    write_json(args.audit_output, audit)
    write_json(args.coordinate_template_output, coordinate_template)
    if seed_text is not None:
        args.seed_output.parent.mkdir(parents=True, exist_ok=True)
        args.seed_output.write_text(seed_text, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
