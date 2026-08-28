FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY baby.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY img/ /usr/share/nginx/html/img/
COPY axel-quiz/ /usr/share/nginx/html/axel-quiz/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
