# FIM-Distribution

Distribution component of the FIM system. Web application that serves the download links to the latest versions of FIM-Daemons as well as graphical dashboard for administrators.

## About The Project

This project is a revision of a Distributed File Integrity Monitoring (FIM) System designed to help organizations detect, track, and respond to file changes across multiple computers in real time. The system allows users to download a lightweight monitoring program (daemon) from a secure web application hosted on Vercel. In its first release, the program will support Windows, with Linux support planned for later versions.

The installer, created using InnoSetup, makes deployment simple—users only need to choose a directory to monitor, and the setup automatically handles all configurations, dependencies, and service registration. Once installed, the daemon continuously watches for file changes using built-in system libraries (Watchdog). For every file scan or detected modification, the daemon computes a SHA-256 cryptographic hash, a unique digital fingerprint of the file’s contents. These hashes are then structured using a Merkle tree, where each file’s hash contributes to a combined “root” hash that summarizes the entire directory’s state. When updates occur, the system recalculates only the affected portions of this structure, generating a minimal hash update to save processing time and network bandwidth. The updated hash and timestamp are securely transmitted to the server via encrypted HTTPS APIs for storage and comparison in the Postgres database.

All collected data is stored in a protected Vercel Postgres instance. To ensure data integrity, the system verifies each upload using authentication tokens that confirm the daemon’s identity and prevent tampering or spoofing. Access to the web dashboard is restricted to authorized administrators through secure login credentials and role-based authentication.

Through this dashboard, administrators can view detailed logs of every file change on each registered machine, identify potential security breaches, and receive alerts if a daemon is uninstalled or disabled. Future updates will include administrative tools to remotely revert unauthorized file changes, synchronize important directories across company systems, and approve updates to monitored files in a controlled way.

By combining real-time monitoring, encrypted communication, and authenticated access, this revised system strengthens an organization’s ability to detect, verify, and respond to potential threats—helping maintain both operational stability and data security across distributed environments.

## Features

*   Graphical dashboard for administrators
*   Secure communication with daemons as supported by token-based authentication
  
## Built With

*   [Language/Framework] Node.js

## Installation

N/A

## Usage
The web application is automatically built and deployed at https://fim-distribution.vercel.app/
