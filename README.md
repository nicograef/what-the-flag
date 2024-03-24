<div align="center">

![Logo](client/public/logo192.png)

  <h1>What The Flag</h1>

</div>

A Quizduell-like game with questions about countries, capitals and flags.


## docker

```bash
docker build -t wtf .
docker run --env-file .env -p 5000:5000 wtf
```

```bash
docker compose up
```

## mongodb

backup & restore

```bash
mongodump --uri="MONGODB_URI" --out=./mongodb-dump

mongorestore --uri="MONGODB_URI" ./mongodb-dump
```

## ssl diffie-hellman
```bash
mkdir nginx-dhparam

sudo openssl dhparam -out ./nginx-dhparam/dhparam-2048.pem 2048
```

## certbot

Find the section of the file with the certbot service definition, and replace the --staging flag in the command option with the --force-renewal flag. This will tell Certbot that you want to request a new certificate with the same domains as an existing certificate.