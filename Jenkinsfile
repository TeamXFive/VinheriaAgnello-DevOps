pipeline {
  agent any

  environment {
    PUBLICACAO = '/publicacao'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --format="Commit %h - %s (%an)"'
      }
    }

    stage('Build') {
      steps {
        sh 'echo "Deploy da Vinheria - build ${BUILD_NUMBER}"'
        sh 'for arquivo in servicos/*/*.js; do node --check "$arquivo" && echo "OK $arquivo"; done'
        sh 'tar czf vinheria-build-${BUILD_NUMBER}.tar.gz servicos'
        archiveArtifacts artifacts: 'vinheria-build-*.tar.gz'
      }
    }

    stage('Segurança') {
      steps {
        sh '''
          if git grep -n -I -E "BEGIN (RSA |EC )?PRIVATE KEY|JWT_SECRET[=][^$]" -- . ":!.env.example"; then
            echo "Segredo encontrado no repositório. Deploy cancelado."
            exit 1
          fi
          echo "Nenhuma chave privada ou segredo no código."
        '''
      }
    }

    stage('Deploy') {
      steps {
        sh '''
          VERSAO="build ${BUILD_NUMBER} - commit $(git rev-parse --short HEAD) - $(date '+%d/%m/%Y %H:%M')"
          for pasta in comum pedidos estoque; do
            mkdir -p "$PUBLICACAO/$pasta"
            cp -R servicos/$pasta/. "$PUBLICACAO/$pasta/"
          done
          for servico in pedidos estoque; do
            echo "$VERSAO" > "$PUBLICACAO/$servico/VERSAO.txt"
          done
          echo "Publicado em $PUBLICACAO:"
          ls -R "$PUBLICACAO"
        '''
      }
    }

    stage('Verificação') {
      steps {
        sh '''
          sleep 8
          curl -fsS --retry 5 --retry-delay 3 --retry-all-errors http://estoque.vinheria.local:8080/health; echo
          curl -fsS --retry 5 --retry-delay 3 --retry-all-errors http://pedidos.vinheria.local:8080/health; echo
        '''
      }
    }
  }

  post {
    success { echo 'Deploy da Vinheria concluído.' }
    failure { echo 'Deploy da Vinheria falhou.' }
  }
}
