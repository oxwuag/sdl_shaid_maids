FROM node:6.4.0

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install

COPY . /usr/src/app/

EXPOSE 10101

CMD ["node", "index.js"]