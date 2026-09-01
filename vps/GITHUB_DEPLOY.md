# GitHub Actions VPS deploy

Production updates are deployed through GitHub Actions instead of interactive PowerShell.

## One-time setup

1. Generate a dedicated ED25519 key named `kitchen_github_actions`.
2. Pipe its public key into `vps/scripts/install-github-deploy.sh` on the VPS.
3. Store only the private key in the repository Actions secret `VPS_SSH_KEY`.
4. Run the workflow **Deploy Kitchen OS to VPS** once manually.
5. After the first successful run, enable deployment on pushes to `main`.

The CI SSH key is separate from the operator's personal `kitchen_vps` key.

## Server-side safety

The GitHub Actions SSH user is `deploy`. It can only sudo the root-owned command:

`/usr/local/sbin/kitchen-os-deploy`

That wrapper serializes deployments with `flock` and executes the existing production deployment script. The production deployment script performs:

- source update
- frontend JavaScript syntax validation
- API image build
- pre-deploy PostgreSQL backup
- database migrations
- API health check
- atomic frontend activation
- frontend rollback if the web health check fails

The PostgreSQL daily backup timer remains independent of deployments.
