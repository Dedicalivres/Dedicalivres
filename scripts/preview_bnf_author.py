"""BnF SRU: read-only bibliographic candidates, no identity assignment or publication."""
import argparse
import datetime
import json
import hashlib
import os
from pathlib import Path
import tempfile
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ENDPOINT = "https://catalogue.bnf.fr/api/SRU"
SRU = "{http://www.loc.gov/zing/srw/}"
DC = "{http://purl.org/dc/elements/1.1/}"
ARK = re.compile(r"ark:/12148/cb[0-9]+[a-z0-9]", re.I)

def request_url(name=None, authority=None, start=1):
    if type(start) is not int or not 1 <= start <= 100_000:
        raise ValueError("Expected startRecord between 1 and 100000")
    if bool(name) == bool(authority):
        raise ValueError("Select exactly one search mode")
    if authority:
        if not re.fullmatch(r"[0-9]{8}", authority):
            raise ValueError("Expected eight-digit internal BnF authority identifier")
        query = f'bib.author2bib any "{authority}"'
    else:
        if not re.fullmatch(r"[\w .’'-]{3,100}", name, re.UNICODE):
            raise ValueError("Invalid candidate name")
        query = f'bib.anywhere all "{name}"'
    return ENDPOINT + "?" + urllib.parse.urlencode({
        "version": "1.2", "operation": "searchRetrieve", "query": query,
        "recordSchema": "dublincore", "startRecord": start, "maximumRecords": 20,
    })

def parse(xml, start=1):
    if type(start) is not int or not 1 <= start <= 100_000:
        raise ValueError("Invalid SRU page offset")
    root = ET.fromstring(xml)
    if root.tag != SRU + "searchRetrieveResponse":
        raise ValueError("Unexpected SRU response")
    if root.find(SRU + "diagnostics") is not None:
        raise ValueError("SRU diagnostic")
    total = int(root.findtext(SRU + "numberOfRecords", "-1"))
    if total < 0:
        raise ValueError("Invalid response count")
    results = []
    for record in root.findall(".//" + SRU + "record"):
        data = record.find(SRU + "recordData")
        if data is None:
            raise ValueError("Missing record data")
        def values(field):
            return list(dict.fromkeys(x.text.strip() for x in data.iter(DC + field) if x.text and x.text.strip()))
        identifiers = values("identifier")
        record_id = record.findtext(SRU + "recordIdentifier", "")
        arks = sorted(set(ARK.findall(" ".join(identifiers + [record_id]))))
        titles = values("title")
        if not titles:
            raise ValueError("Bibliographic record lacks title")
        results.append({"titles": titles, "creators": values("creator"),
                        "publishers": values("publisher"), "dates": values("date"),
                        "identifiers": identifiers, "bnf_arks": arks,
                        "status": "human_review_required"})
    if len(results) > 20 or len(results) > max(0, total - start + 1):
        raise ValueError("Inconsistent SRU page count")
    if total >= start and not results:
        raise ValueError("Expected records on SRU page")
    next_start = start + len(results) if results and start + len(results) <= total else None
    return {"total": total, "records": results, "partial": start > 1 or next_start is not None,
            "has_more": next_start is not None, "next_start_record": next_start}

def lookup(name=None, authority=None, start=1):
    url = request_url(name, authority, start)
    request = urllib.request.Request(url, headers={"User-Agent": "Dedicalivres-BnF-preview/0.1", "Accept": "application/xml"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if urllib.parse.urlparse(response.geturl()).hostname != "catalogue.bnf.fr":
            raise ValueError("Unexpected redirect")
        data = response.read(4_000_001)
    if len(data) > 4_000_000:
        raise ValueError("Response too large")
    return {"source": "Bibliothèque nationale de France — Catalogue général", "documentation": "https://api.bnf.fr/api-sru-catalogue-general",
            "license": "Licence ouverte de l'État (métadonnées, hors droits de tiers)",
            "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "query_url": url, "mode": "authority_candidate" if authority else "name_candidate",
            "publication_allowed": False, "start_record": start, **parse(data, start)}

# Local candidate snapshots only; never a store for human decisions.
def snapshot_path(directory, url):
    return Path(directory) / (hashlib.sha256(url.encode("utf-8")).hexdigest() + ".json")

def save_snapshot(directory, result):
    path = snapshot_path(directory, result["query_url"])
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            tmp = stream.name
            json.dump(result, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)

def read_snapshot(directory, url, now=None):
    with snapshot_path(directory, url).open("rb") as stream:
        raw = stream.read(16_000_001)
    if len(raw) > 16_000_000:
        raise ValueError("Snapshot too large")
    result = json.loads(raw)
    if not isinstance(result, dict) or result.get("query_url") != url or result.get("publication_allowed") is not False:
        raise ValueError("Invalid candidate snapshot")
    records = result.get("records")
    if not isinstance(records, list) or any(not isinstance(r, dict) or r.get("status") != "human_review_required" for r in records):
        raise ValueError("Invalid candidate records")
    stamp = datetime.datetime.fromisoformat(result["retrieved_at"])
    if stamp.tzinfo is None:
        raise ValueError("Snapshot timestamp must have a timezone")
    age = ((now or datetime.datetime.now(datetime.timezone.utc)) - stamp).total_seconds()
    if age < 0:
        raise ValueError("Snapshot timestamp is in the future")
    return {**result, "cache_age_seconds": int(age), "cache_stale": age >= 7 * 86400,
            "cache_origin": "local_candidate_snapshot", "publication_allowed": False}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--name")
    group.add_argument("--authority")
    parser.add_argument("--start", type=int, default=1, help="1-based SRU record offset; candidates only")
    parser.add_argument("--cache-dir", help="Private local directory, outside the public site/repository")
    parser.add_argument("--cache-only", action="store_true", help="Explicit offline read; stale candidates are flagged")
    args = parser.parse_args()
    if args.cache_only:
        if not args.cache_dir:
            parser.error("--cache-only requires --cache-dir")
        result = read_snapshot(args.cache_dir, request_url(args.name, args.authority, args.start))
    else:
        result = lookup(args.name, args.authority, args.start)
        if args.cache_dir:
            save_snapshot(args.cache_dir, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
