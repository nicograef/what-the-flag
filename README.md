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