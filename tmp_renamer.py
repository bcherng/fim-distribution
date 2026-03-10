import os
import re

files = [
    "src/modules/endpoints/controller.js",
    "src/services/events.js",
    "src/modules/events/controller.js",
    "src/middleware/auth.js",
    "src/modules/endpoints/routes.js" # if needed
]

for filepath in files:
    if not os.path.exists(filepath): continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Columns
    content = content.replace("file_count", "tracked_file_count")
    content = content.replace("attestation_valid", "integrity_verified")

    # Table names inside sql clauses
    content = re.sub(r'(FROM|INTO|UPDATE)\s+clients\b', r'\1 endpoints', content)
    content = re.sub(r'clients\.public_key', r'endpoints.public_key', content)
    content = content.replace("clients c", "endpoints c")
    
    # We will keep 'client' as the variable name for simplicity unless we want to do more.
    
    with open(filepath, 'w') as f:
        f.write(content)

print("Renaming applied.")
