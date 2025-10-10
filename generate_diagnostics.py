#!/usr/bin/env python3
"""
Script to generate a consolidated diagnostics file from Elasticsearch diagnostic bundle.
Reads elastic-rest.yml to get API mappings and concatenates JSON files with their API call headers.
"""

import os
import sys
import json
import yaml
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional


def parse_version(version_str: str) -> Tuple[int, int, int]:
    """Parse version string like '8.11.1' into tuple (8, 11, 1)"""
    match = re.match(r'(\d+)\.(\d+)\.(\d+)', version_str)
    if match:
        return tuple(map(int, match.groups()))
    return (0, 0, 0)


def evaluate_version_rule(version: str, rule: str) -> bool:
    """
    Evaluate if a version matches a semver rule.
    Simplified implementation supporting: >=, <, >, <=, =
    """
    rule = rule.strip()
    ver_tuple = parse_version(version)

    # Handle multiple conditions (e.g., ">= 8.2.0 < 8.3.0")
    conditions = re.findall(r'([><=]+)\s*(\d+\.\d+\.\d+)', rule)

    for operator, rule_version in conditions:
        rule_tuple = parse_version(rule_version)

        if operator == '>=':
            if not (ver_tuple >= rule_tuple):
                return False
        elif operator == '>':
            if not (ver_tuple > rule_tuple):
                return False
        elif operator == '<=':
            if not (ver_tuple <= rule_tuple):
                return False
        elif operator == '<':
            if not (ver_tuple < rule_tuple):
                return False
        elif operator == '=':
            if not (ver_tuple == rule_tuple):
                return False

    return len(conditions) > 0


def get_matching_api_endpoint(versions_dict: Dict[str, str], es_version: str) -> Optional[str]:
    """
    Get the matching API endpoint for a given Elasticsearch version.
    Returns the API path that matches the version rules.
    """
    for version_rule, api_path in versions_dict.items():
        if evaluate_version_rule(es_version, version_rule):
            return api_path
    return None


def read_yaml_config(yaml_path: str) -> Dict:
    """Read and parse the elastic-rest.yml configuration file"""
    with open(yaml_path, 'r') as f:
        return yaml.safe_load(f)


def get_es_version(diagnostics_dir: str) -> str:
    """Extract Elasticsearch version from version.json"""
    version_file = os.path.join(diagnostics_dir, 'version.json')
    try:
        with open(version_file, 'r') as f:
            data = json.load(f)
            return data['version']['number']
    except Exception as e:
        print(f"Error reading version: {e}", file=sys.stderr)
        return "8.11.1"  # Default fallback


def find_json_files(diagnostics_dir: str) -> Dict[str, str]:
    """
    Find all JSON files in diagnostics directory.
    Returns dict mapping filename (without extension) to full path.
    """
    json_files = {}

    # Root directory
    for file in Path(diagnostics_dir).glob('*.json'):
        json_files[file.stem] = str(file)

    # Commercial subdirectory
    commercial_dir = Path(diagnostics_dir) / 'commercial'
    if commercial_dir.exists():
        for file in commercial_dir.glob('*.json'):
            json_files[file.stem] = str(file)

    return json_files


def generate_output(yaml_config: Dict, json_files: Dict[str, str], es_version: str, output_file: str):
    """
    Generate the consolidated output file in d4.txt format.
    Format: # N: GET <api_path> 200 OK
            <json_content>
    """
    counter = 1

    with open(output_file, 'w') as out:
        # Process each API definition from YAML
        for api_name, api_config in yaml_config.items():
            if api_name.startswith('#'):  # Skip comments
                continue

            if not isinstance(api_config, dict):
                continue

            versions = api_config.get('versions', {})
            extension = api_config.get('extension', '.json')

            # Skip .txt files for now (only process JSON)
            if extension != '.json':
                continue

            # Get matching API endpoint for this ES version
            api_endpoint = get_matching_api_endpoint(versions, es_version)

            if not api_endpoint:
                continue

            # Check if corresponding JSON file exists
            if api_name not in json_files:
                continue

            json_file_path = json_files[api_name]

            try:
                # Read JSON file
                with open(json_file_path, 'r') as f:
                    json_content = f.read().strip()

                # Skip empty files
                if not json_content:
                    continue

                # Write header in d4.txt format
                out.write(f"# {counter}: GET {api_endpoint} 200 OK\n")

                # Write JSON content
                out.write(json_content)
                out.write("\n")

                counter += 1

            except Exception as e:
                print(f"Error processing {api_name}: {e}", file=sys.stderr)
                continue


def main():
    if len(sys.argv) < 2:
        print("Usage: ./generate_diagnostics.py <diagnostics_directory> [output_file]")
        print("Example: ./generate_diagnostics.py /root/data/api-diagnostics-20240416-135824")
        sys.exit(1)

    diagnostics_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'diagnostics_output.txt'

    # Paths
    yaml_path = os.path.join(diagnostics_dir, 'elastic-rest.yml')

    # Verify paths exist
    if not os.path.exists(diagnostics_dir):
        print(f"Error: Diagnostics directory not found: {diagnostics_dir}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(yaml_path):
        print(f"Error: elastic-rest.yml not found: {yaml_path}", file=sys.stderr)
        sys.exit(1)

    # Get ES version
    es_version = get_es_version(diagnostics_dir)
    print(f"Elasticsearch version: {es_version}")

    # Read YAML config
    print(f"Reading YAML config from: {yaml_path}")
    yaml_config = read_yaml_config(yaml_path)

    # Find JSON files
    print(f"Scanning for JSON files in: {diagnostics_dir}")
    json_files = find_json_files(diagnostics_dir)
    print(f"Found {len(json_files)} JSON files")

    # Generate output
    print(f"Generating output file: {output_file}")
    generate_output(yaml_config, json_files, es_version, output_file)

    print(f"Done! Output written to: {output_file}")


if __name__ == '__main__':
    main()
