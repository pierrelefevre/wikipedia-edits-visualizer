FROM nginx:latest

COPY ./index.html /usr/share/nginx/html/
COPY ./css/ /usr/share/nginx/html/css/
COPY ./js/ /usr/share/nginx/html/js/
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]