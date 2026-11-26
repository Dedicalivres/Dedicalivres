"""BnF SRU: read-only bibliographic candidates, no identity assignment or publication."""
import argparse
import datetime
import json
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
        if not re.fullmatch(r"[0-9]{8,10}", authority):
            raise ValueError("Expected numeric authority notice identifier")
        query = f'bib.author2bib any "{authority}"'
    else:
        if not re.fullmatch(r"[\w .’'-]{3,100}", name, re.UNICODE):
            raise ValueError("Invalid candidate name")
        query = f'bib.anywhere all "{name}"'
    return ENDPOINT + "?" + urllib.parse.urlencode({
        "version": "1.2", "operation": "searchRetrieve", "query": query,
        "recordSchema": "dublincore", "startRecord": start, "maximumRecords": 20,
    })

def parse(xml):
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
    if total and not results:
        raise ValueError("Nonempty catalog without records")
    return {"total": total, "records": results, "partial": total > len(results)}

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
            "publication_allowed": False, "start_record": start, **parse(data)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--name")
    group.add_argument("--authority")
    parser.add_argument("--start", type=int, default=1, help="1-based SRU record offset; candidates only")
    args = parser.parse_args()
    print(json.dumps(lookup(args.name, args.authority, args.start), ensure_ascii=False, indent=2))
